import { useLayoutEffect } from 'react';

const EMPTY_STYLESHEETS = [];

function getStylesheetHref(href) {
  return new URL(href, document.baseURI).href;
}

function isManagedStylesheet(link) {
  if (link.dataset.pageStylesheet === 'true') return true;

  const { hostname, pathname } = new URL(link.href, document.baseURI);
  return hostname === 'fonts.googleapis.com'
    || pathname.startsWith('/customer/css/')
    || pathname.startsWith('/admin/css/');
}

function syncStylesheets(stylesheets) {
  const activeHrefs = new Set(stylesheets.map(getStylesheetHref));
  const enabledHrefs = new Set();
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    if (!isManagedStylesheet(link)) return;
    link.dataset.pageStylesheet = 'true';
    const shouldEnable = activeHrefs.has(link.href) && !enabledHrefs.has(link.href);
    link.media = shouldEnable ? 'all' : 'not all';
    if (shouldEnable) enabledHrefs.add(link.href);
  });
}

function ensureStylesheet(href) {
  const absoluteHref = getStylesheetHref(href);
  let link = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .find((candidate) => candidate.href === absoluteHref);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = absoluteHref;
    document.head.appendChild(link);
  }

  link.dataset.pageStylesheet = 'true';
  link.media = 'all';
}

export default function PageStyles({
  bodyClass,
  stylesheets = EMPTY_STYLESHEETS,
  title,
}) {
  useLayoutEffect(() => {
    const previousBodyClass = document.body.className;
    const previousTitle = document.title;
    document.body.className = bodyClass;
    document.title = title;
    syncStylesheets(stylesheets);
    stylesheets.forEach(ensureStylesheet);

    return () => {
      document.body.className = previousBodyClass;
      document.title = previousTitle;
    };
  }, [bodyClass, stylesheets, title]);

  return null;
}
