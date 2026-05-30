import SwiftUI
import UIKit

enum CameraFeedback {
  static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
    let generator = UIImpactFeedbackGenerator(style: style)
    generator.prepare()
    generator.impactOccurred()
  }

  static func selection() {
    let generator = UISelectionFeedbackGenerator()
    generator.prepare()
    generator.selectionChanged()
  }
}

struct PressFeedbackButtonStyle: ButtonStyle {
  var pressedScale: CGFloat = 0.97
  var pressedOpacity: CGFloat = 0.9

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? pressedScale : 1)
      .opacity(configuration.isPressed ? pressedOpacity : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}
