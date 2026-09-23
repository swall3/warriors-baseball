# iOS pilot project

This is a minimal InningWise iPhone/iPad shell. It uses the live site at `https://inningwise.com/` and keeps website cookies in the device's persistent WebKit store. Links to other domains open in the system browser. It does not request push notification, location, camera, or microphone permissions.

On macOS, install Xcode from Apple and XcodeGen (`brew install xcodegen`). In this directory run `xcodegen generate`, then open `InningWise.xcodeproj` in Xcode. Choose an iPhone simulator and Run. An unsigned simulator build can also be checked with:

```sh
xcodebuild -project InningWise.xcodeproj -scheme InningWise -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

This project has not yet been compiled on macOS or tested on a physical iPhone. Before TestFlight, enroll in the Apple Developer Program, set the Xcode Signing team, test sign-in and parent/coach flows on devices, and review native-app billing requirements. Do not submit the current web shell for public App Store review as a finished native experience.
