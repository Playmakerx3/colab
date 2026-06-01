import { useCallback, useRef } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY;

// Scopes: readonly to pick any file + drive.file to create new docs
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

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

async function getGisToken(tokenRef) {
  if (tokenRef.current) return tokenRef.current;
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPES,
      callback:  (response) => {
        if (response.access_token) {
          tokenRef.current = response.access_token;
          setTimeout(() => { tokenRef.current = null; }, (response.expires_in - 60) * 1000);
          resolve(response.access_token);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// Returns an embed-friendly URL for a Drive file
export function getDriveEmbedUrl(fileUrl) {
  const id = fileUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) return fileUrl;
  if (fileUrl.includes("document"))     return `https://docs.google.com/document/d/${id}/preview`;
  if (fileUrl.includes("spreadsheets")) return `https://docs.google.com/spreadsheets/d/${id}/preview`;
  if (fileUrl.includes("presentation")) return `https://docs.google.com/presentation/d/${id}/preview`;
  return `https://drive.google.com/file/d/${id}/preview`;
}

// Returns the direct edit URL for a Drive file
export function getDriveEditUrl(fileUrl) {
  const id = fileUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) return fileUrl;
  if (fileUrl.includes("document"))     return `https://docs.google.com/document/d/${id}/edit`;
  if (fileUrl.includes("spreadsheets")) return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  if (fileUrl.includes("presentation")) return `https://docs.google.com/presentation/d/${id}/edit`;
  return `https://drive.google.com/file/d/${id}/view`;
}

export function useGoogleDrivePicker() {
  const tokenRef = useRef(null);

  // ── Open the Drive file picker ──
  const openPicker = useCallback((onFilePicked) => {
    async function proceed() {
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise((res) => window.gapi.load("picker", res));
      const token = await getGisToken(tokenRef);

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
            });
          }
        })
        .build();
      picker.setVisible(true);
    }
    proceed().catch(console.error);
  }, []);

  // ── Create a new shared Google Doc and return its file info ──
  const createSharedDoc = useCallback(async (docName) => {
    const token = await getGisToken(tokenRef);

    // 1 — create the document
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:     docName,
        mimeType: "application/vnd.google-apps.document",
      }),
    });
    const file = await createRes.json();
    if (!file.id) throw new Error("Failed to create Google Doc");

    // 2 — share it: anyone with the link can edit
    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ role: "writer", type: "anyone" }),
    });

    return {
      driveFileId: file.id,
      name:        docName,
      mimeType:    "application/vnd.google-apps.document",
      url:         `https://docs.google.com/document/d/${file.id}/edit`,
    };
  }, []);

  // ── Create a new shared Google Sheet ──
  const createSharedSheet = useCallback(async (name) => {
    const token = await getGisToken(tokenRef);
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet" }),
    });
    const file = await createRes.json();
    if (!file.id) throw new Error("Failed to create Google Sheet");
    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ role: "writer", type: "anyone" }),
    });
    return {
      driveFileId: file.id,
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      url:      `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
    };
  }, []);

  return { openPicker, createSharedDoc, createSharedSheet };
}
