/** Download a URL that has already passed the media resolver. */
export function downloadMedia(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}
