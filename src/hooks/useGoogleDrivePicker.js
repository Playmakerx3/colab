import { useCallback, useRef } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES    = "https://www.googleapis.com/auth/drive.readonly";

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src   = src;
    s.async = true;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

export function useGoogleDrivePicker() {
  const tokenRef = useRef(null);

  const openPicker = useCallback((onFilePicked) => {
    async function proceed() {
      // 1 — load picker library
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise((res) => window.gapi.load("picker", res));

      const showPicker = (token) => {
        const view = new window.google.picker.DocsView()
          .setIncludeFolders(false)
          .setSelectFolderEnabled(false);

        const picker = new window.google.picker.PickerBuilder()
          .addView(view)
          .addView(window.google.picker.ViewId.RECENTLY_PICKED)
          .setOAuthToken(token)
          .setDeveloperKey(API_KEY)
          .setTitle("Select a Google Drive file")
          .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const doc = data.docs[0];
              onFilePicked({
                driveFileId: doc.id,
                name:        doc.name,
                mimeType:    doc.mimeType,
                url:         doc.url || `https://drive.google.com/file/d/${doc.id}/view`,
                iconUrl:     doc.iconUrl,
              });
            }
          })
          .build();
        picker.setVisible(true);
      };

      // 2 — if we already have a token (not expired), reuse it
      if (tokenRef.current) {
        showPicker(tokenRef.current);
        return;
      }

      // 3 — request a fresh token via GIS
      await loadScript("https://accounts.google.com/gsi/client");
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:     SCOPES,
        callback:  (response) => {
          if (response.access_token) {
            tokenRef.current = response.access_token;
            // tokens last ~1 h; clear cache before expiry so next call re-auths
            setTimeout(() => { tokenRef.current = null; }, (response.expires_in - 60) * 1000);
            showPicker(response.access_token);
          }
        },
      });
      // "" = skip consent screen if already granted, "consent" forces re-prompt
      tokenClient.requestAccessToken({ prompt: "" });
    }

    proceed().catch(console.error);
  }, []);

  return { openPicker };
}
