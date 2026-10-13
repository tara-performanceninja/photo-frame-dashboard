#!/usr/bin/env python3
"""Prepare a review copy of the actual installed app source, retaining its exit code."""
import argparse
from pathlib import Path


def patch(source):
    replacements = [
        ('private WebView web;', 'private WebView web;\n  private LifeShell lifeShell;'),
        ('String url = getIntent().getDataString();\n    web.loadUrl(url != null ? url : DEFAULT_URL);',
         '''String url = getIntent().getDataString();
    if (url == null) url = getPreferences(MODE_PRIVATE).getString("life_start_url", DEFAULT_URL);
    if (LifeShell.accepts(url)) {
      getPreferences(MODE_PRIVATE).edit().putString("life_start_url", url).apply();
      lifeShell = new LifeShell(this, web, url, showControls);
    } else web.loadUrl(url);'''),
        ('if (url != null) {\n      handler.removeCallbacks(retry);\n      web.loadUrl(url);\n    }',
         '''if (url != null) {
      handler.removeCallbacks(retry);
      if (LifeShell.accepts(url)) {
        getPreferences(MODE_PRIVATE).edit().putString("life_start_url", url).apply();
        recreate();
      } else if (lifeShell != null && url.startsWith("https://teamtri.team/")) {
        lifeShell.select("teamtri");
      } else if (lifeShell == null) web.loadUrl(url);
    }'''),
        ('if (web != null) web.destroy();', 'if (lifeShell != null) lifeShell.destroy();\n    if (web != null) web.destroy();'),
        ('if (web.canGoBack()) web.goBack();', 'if (lifeShell != null) lifeShell.back();\n    else if (web.canGoBack()) web.goBack();'),
    ]
    for old, new in replacements:
        if source.count(old) != 1:
            raise ValueError('Unexpected launch/lifecycle code. Review actual source before patching.')
        source = source.replace(old, new, 1)
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('installed_source', type=Path)
    parser.add_argument('review_copy', type=Path)
    args = parser.parse_args()
    if args.installed_source.resolve() == args.review_copy.resolve():
        parser.error('Use a separate review-copy path.')
    result = patch(args.installed_source.read_text())
    with args.review_copy.open('x') as output:
        output.write(result)
    print('Review copy prepared. Existing source unchanged.')
