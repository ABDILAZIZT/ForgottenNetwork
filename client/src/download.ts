export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow browsers time to consume the URL after asynchronous canvas encoding.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
