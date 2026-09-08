// Launches Meta's WhatsApp Embedded Signup popup for WhatsApp "Coexistence" —
// the only supported way to connect a number while letting the employee keep
// using the regular WhatsApp Business app on their phone (see backend's
// completeEmbeddedSignup for why the manual Connect form can't do this).
//
// App ID and the Login Configuration ID are not secrets — they're meant to be
// embedded in client-side code (same as any OAuth client_id), so they're
// hardcoded here rather than round-tripped through an env var.
const META_APP_ID = '2072975240249128';
const WHATSAPP_CONFIG_ID = '3500849906764412'; // "WhatsApp Coexistence" login configuration

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: META_APP_ID, autoLogAppEvents: false, xfbml: false, version: 'v21.0' });
      resolve();
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return; // fbAsyncInit above will still fire once it loads

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'));
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export interface EmbeddedSignupResult {
  code: string;
  // phoneNumberId is deliberately optional — Meta's Coexistence completion
  // event (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING) routinely omits it; the
  // backend looks it up from the WABA instead of trusting the popup for it.
  phoneNumberId?: string;
  wabaId: string;
}

// The set of "this session is done, here's what was picked" events Meta
// sends. Coexistence's completion event is FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING
// — NOT the plain "FINISH" used by the full-migration signup flow. Missing
// this was the actual bug: the popup was completing successfully the whole
// time, this listener just never recognized it.
const FINISH_EVENTS = new Set([
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

/**
 * Opens the Embedded Signup popup and resolves once the employee has
 * finished picking their WhatsApp Business app number and Meta has handed
 * back both the OAuth `code` and (via a postMessage the popup sends while
 * it's still open) the wabaId they selected.
 */
export async function launchWhatsAppEmbeddedSignup(): Promise<EmbeddedSignupResult> {
  await loadFacebookSdk();

  return new Promise((resolve, reject) => {
    let sessionData: { phoneNumberId?: string; wabaId?: string } = {};
    let settled = false;

    const onMessage = (event: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(event.origin).hostname)) return;
      let data: any;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

      // Diagnostic — persists every raw message this listener ever receives,
      // independent of the resolve/reject flow below, so it survives even if
      // the tab loses its in-memory state (backgrounded/discarded) before the
      // rest of the flow finishes. Check via DevTools console:
      //   JSON.parse(localStorage.getItem('wa_embedded_signup_debug'))
      try {
        const log = JSON.parse(localStorage.getItem('wa_embedded_signup_debug') || '[]');
        log.push({ at: new Date().toISOString(), data });
        localStorage.setItem('wa_embedded_signup_debug', JSON.stringify(log.slice(-20)));
      } catch { /* ignore */ }

      const evt = String(data.event ?? '').toUpperCase();
      if (FINISH_EVENTS.has(evt)) {
        sessionData = {
          phoneNumberId: data.data?.phone_number_id,
          wabaId: data.data?.waba_id,
        };
      } else if (evt === 'CANCEL' || evt === 'ERROR') {
        cleanup();
        if (!settled) { settled = true; reject(new Error(data.data?.error_message || 'Signup was cancelled')); }
      }
    };

    const cleanup = () => window.removeEventListener('message', onMessage);
    window.addEventListener('message', onMessage);

    window.FB.login(
      (response: any) => {
        cleanup();
        if (settled) return;
        const code = response?.authResponse?.code;
        if (!code || !sessionData.wabaId) {
          settled = true;
          reject(new Error('Signup did not complete — no number was selected, or the popup was closed early'));
          return;
        }
        settled = true;
        resolve({ code, phoneNumberId: sessionData.phoneNumberId, wabaId: sessionData.wabaId });
      },
      {
        config_id: WHATSAPP_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding', // Coexistence — keep using the phone app
          sessionInfoVersion: '3',
        },
      },
    );
  });
}
