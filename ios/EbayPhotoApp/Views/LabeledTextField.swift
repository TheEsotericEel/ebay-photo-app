import SwiftUI

struct LabeledTextField: View {
  let title: String
  @Binding var text: String
  var autocapitalize: TextInputAutocapitalization?
  var autocorrectDisabled = false
  var keyboardType: UIKeyboardType = .default
  var isSecure = false
  var accessibilityIdentifier: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.caption)
        .foregroundStyle(.secondary)
      Group {
        if isSecure {
          SecureField(title, text: $text)
        } else {
          TextField(title, text: $text)
        }
      }
      .textFieldStyle(.roundedBorder)
      .keyboardType(keyboardType)
      .modifier(OptionalAutocapitalize(autocapitalize: autocapitalize))
      .autocorrectionDisabled(autocorrectDisabled)
      .ifLet(accessibilityIdentifier) { view, identifier in
        view.accessibilityIdentifier(identifier)
      }
    }
  }
}

struct OptionalAutocapitalize: ViewModifier {
  let autocapitalize: TextInputAutocapitalization?

  func body(content: Content) -> some View {
    if let autocapitalize {
      content.textInputAutocapitalization(autocapitalize)
    } else {
      content
    }
  }
}

extension View {
  @ViewBuilder
  func ifLet<T, Content: View>(
    _ value: T?,
    @ViewBuilder transform: (Self, T) -> Content
  ) -> some View {
    if let value {
      transform(self, value)
    } else {
      self
    }
  }
}
