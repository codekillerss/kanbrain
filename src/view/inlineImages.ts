const IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const MD_IMAGE_URL_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

// `organization` is the short org name (e.g. "myorg"), the same value used to build
// `https://dev.azure.com/${organization}/...` in client.ts — not a full host string.
function isAdoHostedUrl(url: string, organization: string): boolean {
  try {
    const host = new URL(url).host;
    return host === 'dev.azure.com' || host === `${organization}.visualstudio.com`;
  } catch {
    return false;
  }
}

export function extractImageUrls(html: string, organization: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const url = match[1];
    if (isAdoHostedUrl(url, organization)) {
      urls.add(url);
    }
  }
  return [...urls];
}

export function extractMarkdownImageUrls(text: string, organization: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(MD_IMAGE_URL_RE)) {
    const url = match[1];
    if (isAdoHostedUrl(url, organization)) {
      urls.add(url);
    }
  }
  return [...urls];
}

export function rewriteImageSrcs(html: string, images: Record<string, string | null>): string {
  return html.replace(IMG_SRC_RE, (tag, url) => {
    if (!(url in images)) {
      return tag;
    }
    const dataUri = images[url];
    if (!dataUri) {
      return '<span class="kb-image-unavailable">🖼 imagem indisponível</span>';
    }
    return tag.replace(url, dataUri);
  });
}
