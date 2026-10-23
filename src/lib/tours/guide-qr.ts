import QRCode from "qrcode";

/**
 * The badge QR contains only the public guide row UUID, never an ID number,
 * document path, consent value, or other personal/sensitive data.
 */
export function createGuideQrPayload(guideId: string): string {
  return `CONNECT-DAET-GUIDE:${guideId}`;
}

export async function createGuideQrPngDataUrl(guideId: string): Promise<string> {
  return createQrPngDataUrl(createGuideQrPayload(guideId));
}

/** PNG data URL for any QR content (badge verify links, booking tickets). */
export async function createQrPngDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    type: "image/png",
    errorCorrectionLevel: "H",
    margin: 3,
    width: 720,
    color: {
      dark: "#172b24",
      light: "#ffffff",
    },
  });
}
