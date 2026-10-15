Workfolio Open Graph metadata update

Files:
- workfolio-og-metadata.patch: unified patch for the current index.html on main.
- head-metadata-snippet.html: metadata block, if you prefer to edit index.html manually.

No image was created. The og:image and twitter:image tags point to the existing repository screenshot:
assets/imgs/screenshots/templates-overview.png

Apply the patch from a local clone of the Workfolio repository root:
  git apply workfolio-og-metadata.patch
  git diff --check
  git diff -- index.html
  git add index.html
  git commit -m "Add social sharing metadata for Workfolio"
  git push

After GitHub Pages redeploys, use LinkedIn Post Inspector to refresh the cache:
  https://www.linkedin.com/post-inspector/
Enter https://erfankhadiv.github.io/Workfolio/ and inspect it. Then paste the URL into a new LinkedIn post and check that the preview appears before publishing.

Note: this patch only updates the root landing page (index.html), which is the URL shared in the LinkedIn post. It cannot force LinkedIn to display a specific button label; LinkedIn controls its link-preview UI.
