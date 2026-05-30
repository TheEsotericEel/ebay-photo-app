import XCTest

final class EbayPhotoAppUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  func testFreshLaunchShowsAuthView() {
    let app = launchApp()

    XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.secureTextFields["auth.password"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["auth.signIn"].waitForExistence(timeout: 10))

    attachScreenshot(named: "fresh-launch-auth")
  }

  func testOpenCaptureHomeRouteShowsCaptureHome() {
    let app = launchApp(arguments: ["-open-capture-home"])

    XCTAssertTrue(app.otherElements["captureHome.screen"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["captureHome.openCamera"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["captureHome.reviewQueue"].waitForExistence(timeout: 10))

    attachScreenshot(named: "open-capture-home")
  }

  func testSeededLiveCameraRouteShowsStableCameraState() {
    let app = launchApp(arguments: ["-open-live-camera-with-seeded-photo"])

    XCTAssertTrue(app.otherElements["liveCamera.screen"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["liveCamera.photoCount"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["liveCamera.next"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["liveCamera.done"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["liveCamera.next"].isEnabled)
    XCTAssertEqual(app.staticTexts["liveCamera.photoCount"].label, "1 photos captured")

    attachScreenshot(named: "seeded-live-camera")
  }

  private func launchApp(arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = arguments
    app.launch()
    return app
  }

  private func attachScreenshot(named name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
