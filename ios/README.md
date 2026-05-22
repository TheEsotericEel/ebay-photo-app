# Native iOS Scaffold

This folder contains the native iPhone app for the eBay Photo App workflow.

## What is here

- SwiftUI app shell source
- Camera session skeleton
- Auth/home/capture screen skeleton
- Supabase service stub
- Camera preview wrapper
- Native Info.plist template

## Current product role

The iPhone app is a capture + lightweight queue tool.

It is intended to:

- capture photos quickly
- keep the camera central during capture
- build a local multi-item queue
- keep each item packet associated with a store
- preserve local photos until upload is safely confirmed
- hand work off to desktop through an explicit submit/upload step

It is not intended to become the final listing workspace.

## What you need on your Mac

You will need:

- Xcode installed from the Mac App Store
- an Apple ID signed in to Xcode
- an iPhone with Developer Mode enabled if you want to run on device

If Xcode is not installed yet, install it from the Mac App Store before opening this folder.
If Xcode says no destinations are available, install the iOS 26.5 Simulator runtime from `Xcode > Settings > Components`.

## Working mobile workflow direction

- The camera screen edits the currently active item packet.
- `Next` is the item boundary and should save the current item into the local queue, then start the next item.
- The queue may contain items from multiple stores.
- `Submit` is a deliberate action and should send only eligible unsubmitted items.
- Exact `Done` behavior, queue review UI, and backend batch mapping are still intentionally deferred.

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
