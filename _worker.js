const MARKDOWN_ACCEPT = /(?:^|,)\s*text\/markdown(?:\s*;|\s*,|\s*$)/i;

function acceptsMarkdown(request) {
  return MARKDOWN_ACCEPT.test(request.headers.get('Accept') ?? '');
}

function withAcceptVary(headers) {
  const values = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  values.add('Accept');
  headers.set('Vary', [...values].join(', '));
}

function copyResponse(response, contentType) {
  const headers = new Headers(response.headers);
  withAcceptVary(headers);
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isRoot = url.pathname === '/' || url.pathname === '/index.html';
    const isHeadOrGet = request.method === 'GET' || request.method === 'HEAD';

    if (isRoot && isHeadOrGet && acceptsMarkdown(request)) {
      const markdownURL = new URL('/llms.txt', request.url);
      const markdownRequest = new Request(markdownURL, request);
      const markdownResponse = await env.ASSETS.fetch(markdownRequest);
      if (markdownResponse.ok) {
        return copyResponse(markdownResponse, 'text/markdown; charset=utf-8');
      }
    }

    const response = await env.ASSETS.fetch(request);
    return isRoot && isHeadOrGet ? copyResponse(response) : response;
  },
};
