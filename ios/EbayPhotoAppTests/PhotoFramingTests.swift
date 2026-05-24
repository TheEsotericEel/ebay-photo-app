import CoreGraphics
import UIKit
import XCTest

@testable import EbayPhotoApp

final class PhotoFramingTests: XCTestCase {
  func testEffectiveBakeOrientationSkipsStaleMetadataOnPortraitPixels() throws {
    let portraitPixels = try markedCGImage(size: CGSize(width: 80, height: 120))
    XCTAssertEqual(
      PhotoFraming.effectiveBakeOrientation(cgImage: portraitPixels, metadataOrientation: .right),
      .up
    )
  }

  func testEffectiveBakeOrientationKeepsMetadataOnLandscapePixels() throws {
    let landscapePixels = try markedCGImage(size: CGSize(width: 120, height: 80))
    XCTAssertEqual(
      PhotoFraming.effectiveBakeOrientation(cgImage: landscapePixels, metadataOrientation: .right),
      .right
    )
  }

  func testStalePortraitMetadataDoesNotDoubleRotatePixels() throws {
    let portraitPixels = try markedCGImage(size: CGSize(width: 80, height: 120))
    let normalized = PhotoFraming.portraitLockedCGImage(from: portraitPixels, exifOrientation: .right)
    XCTAssertGreaterThanOrEqual(normalized.height, normalized.width)
    XCTAssertEqual(normalized.width, portraitPixels.width)
    XCTAssertEqual(normalized.height, portraitPixels.height)
  }

  func testPortraitLockedRotatesLandscapeSensorBufferToPortraitPixels() throws {
    let landscape = try markedCGImage(size: CGSize(width: 120, height: 80))
    let portraitLocked = PhotoFraming.portraitLockedCGImage(from: landscape, exifOrientation: .right)
    XCTAssertGreaterThanOrEqual(portraitLocked.height, portraitLocked.width)
    XCTAssertEqual(portraitLocked.width, landscape.height)
    XCTAssertEqual(portraitLocked.height, landscape.width)
  }

  func testLandscapeSensorWithRightExifProducesPortraitJPEGDeliverable() throws {
    let landscape = try landscapeSensorCGImageWithTopTextBand()
    guard let deliverable = PhotoFraming.nativeDeliverableAndThumbnail(
      from: landscape,
      exifOrientation: .right
    ) else {
      XCTFail("Expected native deliverable")
      return
    }

    try assertDeliverableJPEGIsPortraitUpright(deliverable.jpeg)

    guard let thumbData = deliverable.thumbnail else {
      XCTFail("Expected thumbnail")
      return
    }
    try assertDeliverableJPEGIsPortraitUpright(thumbData, allowSquare: true)
  }

  func testPortraitSensorWithStaleExifKeepsReadableTopBandUpright() throws {
    // Real capture: connection rotation already produced portrait pixels; stale EXIF must not re-rotate.
    let portraitSensor = try portraitSensorCGImageWithTopTextBand()
    let normalized = PhotoFraming.portraitLockedCGImage(from: portraitSensor, exifOrientation: .right)
    try assertTopBandIsDarkerThanBottomBand(in: UIImage(cgImage: normalized))

    guard let deliverable = PhotoFraming.nativeDeliverableAndThumbnail(
      from: portraitSensor,
      exifOrientation: .right
    ) else {
      XCTFail("Expected native deliverable")
      return
    }
    try assertDeliverableJPEGIsPortraitUpright(deliverable.jpeg)
  }

  func testSquareDeliverableFromLandscapeSensorKeepsMarkersAndNormalizesThumbnail() throws {
    let landscape = try markedCGImage(size: CGSize(width: 120, height: 80))
    guard let deliverable = PhotoFraming.squareDeliverableAndThumbnail(
      from: landscape,
      exifOrientation: .right
    ) else {
      XCTFail("Expected square deliverable")
      return
    }

    try assertDeliverableJPEGIsPortraitUpright(deliverable.jpeg, allowSquare: true)
    XCTAssertEqual(PhotoFraming.jpegProperties(deliverable.jpeg)?.width,
                   PhotoFraming.jpegProperties(deliverable.jpeg)?.height)
    try assertCenterIsGreen(in: deliverable.jpeg)

    guard let thumbData = deliverable.thumbnail else {
      XCTFail("Expected thumbnail")
      return
    }
    try assertDeliverableJPEGIsPortraitUpright(thumbData, allowSquare: true)
    try assertCenterIsGreen(in: thumbData)
  }

  func testSimulatedConnectionRotatedPortraitBufferWithStaleExif() throws {
    // Mimics cgImageRepresentation() after videoRotationAngle=90: portrait pixels, stale EXIF .right.
    let portraitPixels = try markedCGImage(size: CGSize(width: 80, height: 120))
    guard let deliverable = PhotoFraming.nativeDeliverableAndThumbnail(
      from: portraitPixels,
      exifOrientation: .right
    ) else {
      XCTFail("Expected native deliverable")
      return
    }

    guard let props = PhotoFraming.jpegProperties(deliverable.jpeg) else {
      XCTFail("Expected JPEG properties")
      return
    }
    XCTAssertEqual(props.exifOrientation, 1)
    XCTAssertGreaterThanOrEqual(props.height, props.width)
  }

  // MARK: - Fixtures

  private func markedCGImage(size: CGSize) throws -> CGImage {
    let image = makeMarkedFixture(size: size)
    guard let cgImage = image.cgImage else {
      throw NSError(domain: "PhotoFramingTests", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing CGImage"])
    }
    return cgImage
  }

  private func landscapeSensorCGImageWithTopTextBand() throws -> CGImage {
    let image = makeLandscapeSensorFixtureWithTopTextBand()
    guard let cgImage = image.cgImage else {
      throw NSError(domain: "PhotoFramingTests", code: 3, userInfo: [NSLocalizedDescriptionKey: "Missing CGImage"])
    }
    return cgImage
  }

  private func portraitSensorCGImageWithTopTextBand() throws -> CGImage {
    let size = CGSize(width: 80, height: 120)
    let renderer = UIGraphicsImageRenderer(size: size)
    let image = renderer.image { _ in
      UIColor.white.setFill()
      UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()
      let bandHeight = size.height * 0.2
      UIColor.black.setFill()
      UIBezierPath(rect: CGRect(x: 0, y: 0, width: size.width, height: bandHeight)).fill()
      let attrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.boldSystemFont(ofSize: 14),
        .foregroundColor: UIColor.white,
      ]
      NSString(string: "LEGIBLE-TOP").draw(at: CGPoint(x: 8, y: 6), withAttributes: attrs)
    }
    guard let cgImage = image.cgImage else {
      throw NSError(domain: "PhotoFramingTests", code: 4, userInfo: [NSLocalizedDescriptionKey: "Missing CGImage"])
    }
    return cgImage
  }

  private func makeMarkedFixture(size: CGSize) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      UIColor.white.setFill()
      UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()
      UIColor.red.setFill()
      UIBezierPath(rect: CGRect(x: 0, y: 0, width: 12, height: 12)).fill()
      UIColor.blue.setFill()
      UIBezierPath(rect: CGRect(x: 0, y: size.height - 12, width: 12, height: 12)).fill()
      UIColor.green.setFill()
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      UIBezierPath(
        rect: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16)
      ).fill()
    }
  }

  private func makeLandscapeSensorFixtureWithTopTextBand() -> UIImage {
    let size = CGSize(width: 120, height: 80)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      UIColor.white.setFill()
      UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()

      UIColor.red.setFill()
      UIBezierPath(rect: CGRect(x: 0, y: 0, width: 12, height: 12)).fill()

      let bandHeight = size.height * 0.2
      UIColor.black.setFill()
      UIBezierPath(rect: CGRect(x: 0, y: 0, width: size.width, height: bandHeight)).fill()

      let attrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.boldSystemFont(ofSize: 14),
        .foregroundColor: UIColor.white,
      ]
      NSString(string: "LEGIBLE-TOP").draw(at: CGPoint(x: 8, y: 6), withAttributes: attrs)
    }
  }

  // MARK: - Assertions

  private func assertDeliverableJPEGIsPortraitUpright(
    _ jpeg: Data,
    allowSquare: Bool = false,
    file: StaticString = #filePath,
    line: UInt = #line
  ) throws {
    guard let props = PhotoFraming.jpegProperties(jpeg) else {
      XCTFail("Expected JPEG properties", file: file, line: line)
      return
    }
    XCTAssertEqual(props.exifOrientation, 1, file: file, line: line)
    if allowSquare {
      XCTAssertGreaterThanOrEqual(props.height, props.width, file: file, line: line)
    } else {
      XCTAssertGreaterThan(props.height, props.width, file: file, line: line)
    }
  }

  private func assertCenterIsGreen(
    in jpeg: Data,
    file: StaticString = #filePath,
    line: UInt = #line
  ) throws {
    guard let image = UIImage(data: jpeg), let props = PhotoFraming.jpegProperties(jpeg) else {
      XCTFail("Expected decodable JPEG", file: file, line: line)
      return
    }
    let x = props.width / 2
    let y = props.height / 2
    let color = try sampleColor(in: image, x: x, y: y)
    XCTAssertTrue(color.isCloseTo(.green), "Expected green center marker, got \(color)", file: file, line: line)
  }

  private func assertTopBandIsDarkerThanBottomBand(
    in image: UIImage,
    file: StaticString = #filePath,
    line: UInt = #line
  ) throws {
    let uiImage = image
    let cgImage = try XCTUnwrap(image.cgImage)
    let topLuma = try averageLuminance(in: uiImage, yStart: 0, yEnd: max(1, cgImage.height / 5))
    let bottomLuma = try averageLuminance(
      in: uiImage,
      yStart: max(0, (cgImage.height * 4) / 5),
      yEnd: cgImage.height
    )
    let leftLuma = try averageLuminance(
      in: uiImage,
      xStart: 0,
      xEnd: max(1, cgImage.width / 5)
    )
    XCTAssertLessThan(
      topLuma,
      bottomLuma - 0.15,
      "Readable top band should stay at the visual top (top \(topLuma) vs bottom \(bottomLuma))",
      file: file,
      line: line
    )
    XCTAssertLessThan(
      topLuma,
      leftLuma - 0.1,
      "Top text band should be darker than the sides when upright (top \(topLuma) vs left \(leftLuma))",
      file: file,
      line: line
    )
  }

  private func sampleColor(in image: UIImage, x: Int, y: Int) throws -> UIColor {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1), format: format)
    let pixel = renderer.image { _ in
      image.draw(at: CGPoint(x: -CGFloat(x), y: -CGFloat(y)))
    }
    guard
      let cgImage = pixel.cgImage,
      let provider = cgImage.dataProvider,
      let data = CFDataGetBytePtr(provider.data)
    else {
      throw NSError(domain: "PhotoFramingTests", code: 1)
    }
    return UIColor(
      red: CGFloat(data[0]) / 255,
      green: CGFloat(data[1]) / 255,
      blue: CGFloat(data[2]) / 255,
      alpha: 1
    )
  }

  private func averageLuminance(in image: UIImage, yStart: Int, yEnd: Int) throws -> CGFloat {
    let width = Int(image.size.width)
    let height = Int(image.size.height)
    guard width > 0, height > 0, yEnd > yStart else { return 1 }

    var total: CGFloat = 0
    var count: CGFloat = 0
    for y in yStart..<min(yEnd, height) {
      for x in [width / 4, width / 2, (width * 3) / 4] {
        total += try luminance(in: image, x: x, y: y)
        count += 1
      }
    }
    return count > 0 ? total / count : 1
  }

  private func averageLuminance(in image: UIImage, xStart: Int, xEnd: Int) throws -> CGFloat {
    let width = Int(image.size.width)
    let height = Int(image.size.height)
    guard width > 0, height > 0, xEnd > xStart else { return 1 }

    var total: CGFloat = 0
    var count: CGFloat = 0
    for x in xStart..<min(xEnd, width) {
      for y in [height / 4, height / 2, (height * 3) / 4] {
        total += try luminance(in: image, x: x, y: y)
        count += 1
      }
    }
    return count > 0 ? total / count : 1
  }

  private func luminance(in image: UIImage, x: Int, y: Int) throws -> CGFloat {
    let color = try sampleColor(in: image, x: x, y: y)
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    color.getRed(&r, green: &g, blue: &b, alpha: &a)
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
  }
}

private extension UIColor {
  func isCloseTo(_ other: UIColor, tolerance: CGFloat = 0.2) -> Bool {
    var r1: CGFloat = 0
    var g1: CGFloat = 0
    var b1: CGFloat = 0
    var a1: CGFloat = 0
    var r2: CGFloat = 0
    var g2: CGFloat = 0
    var b2: CGFloat = 0
    var a2: CGFloat = 0
    guard getRed(&r1, green: &g1, blue: &b1, alpha: &a1),
          other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2) else {
      return false
    }
    return abs(r1 - r2) <= tolerance && abs(g1 - g2) <= tolerance && abs(b1 - b2) <= tolerance
  }
}
