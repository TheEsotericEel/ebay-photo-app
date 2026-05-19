# Native iOS Scaffold

This folder is the first native iOS build starting point for the eBay Photo App migration.

## What is here

- SwiftUI app shell source
- Camera session skeleton
- Auth/home/capture screen skeleton
- Supabase service stub
- Camera preview wrapper
- Native Info.plist template

## What you need on your Mac

You will need:

- Xcode installed from the Mac App Store
- an Apple ID signed in to Xcode
- an iPhone with Developer Mode enabled if you want to run on device

If Xcode is not installed yet, install it from the Mac App Store before opening this folder.
If Xcode says no destinations are available, install the iOS 26.5 Simulator runtime from `Xcode > Settings > Components`.

## What I built here

The source files under `ios/EbayPhotoApp/` are ready to drop into a new Xcode iOS app target.

## Your next steps

1. Install Xcode.
2. Open Xcode and create a new iOS App project named `EbayPhotoApp`.
3. Use SwiftUI and the default lifecycle.
4. Replace the generated app files with the source files in this folder.
5. Set the camera usage strings in the project settings or Info.plist.
6. Enable Developer Mode on your iPhone.
7. Sign the app with your Apple ID team in Xcode.
8. If the scheme cannot build because no simulator destination exists, install the iOS 26.5 Simulator runtime in Xcode.

When Xcode is installed, I can help wire the project file and finish the first build loop.
