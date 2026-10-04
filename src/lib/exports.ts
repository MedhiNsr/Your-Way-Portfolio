export function googleMapsUrl(from: string, to: string) {
  const o = encodeURIComponent(from);
  const d = encodeURIComponent(to);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

export function wazeUrl(toLat: number, toLng: number) {
  return `https://waze.com/ul?ll=${toLat},${toLng}&navigate=yes`;
}
