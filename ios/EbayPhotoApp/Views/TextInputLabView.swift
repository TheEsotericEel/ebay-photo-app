import SwiftUI
import UIKit
import QuartzCore

enum InputLabLog {
  private static let start = CACurrentMediaTime()

  static func event(_ message: String) {
    let elapsedMs = Int((CACurrentMediaTime() - start) * 1000)
    AppLog.input.info("[INPUT-LAB] t+\(elapsedMs, privacy: .public)ms \(message, privacy: .public)")
  }
}

#if DEBUG
private let isInputLabAutoRunEnabled = ProcessInfo.processInfo.arguments.contains("-input-lab-autorun")
#endif

struct TextInputLabView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var selectedCase: LabCase = .bare

  enum LabCase: String, CaseIterable, Identifiable {
    case bare = "Case 1"
    case nav = "Case 2"
    case scroll = "Case 3"
    case uikit = "Case 4"

    var id: String { rawValue }
  }

  var body: some View {
    VStack(spacing: 12) {
      HStack {
        Text("Text Input Lab")
          .font(.title3.weight(.semibold))
        Spacer()
        Button("Close") { dismiss() }
      }
      .padding(.horizontal)
      .padding(.top, 8)

      Picker("Case", selection: $selectedCase) {
        Text("Case 1").tag(LabCase.bare)
        Text("Case 2").tag(LabCase.nav)
        Text("Case 3").tag(LabCase.scroll)
        Text("Case 4").tag(LabCase.uikit)
      }
      .pickerStyle(.segmented)
      .padding(.horizontal)

      Group {
        switch selectedCase {
        case .bare:
          BareTextFieldCaseView()
        case .nav:
          NavigationStackTextFieldCaseView()
        case .scroll:
          ScrollViewTextFieldCaseView()
        case .uikit:
          UIKitTextFieldCaseView()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .onAppear {
      InputLabLog.event("lab open selectedCase=\(selectedCase.rawValue)")
      #if DEBUG
      runAutoMatrixIfRequested()
      #endif
    }
    .onChange(of: selectedCase) { _, new in
      InputLabLog.event("case switched to \(new.rawValue)")
    }
    .padding(.bottom, 12)
  }

  #if DEBUG
  private func runAutoMatrixIfRequested() {
    guard isInputLabAutoRunEnabled else { return }
    Task { @MainActor in
      InputLabLog.event("auto matrix start")
      try? await Task.sleep(nanoseconds: 300_000_000)
      selectedCase = .bare
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      selectedCase = .nav
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      selectedCase = .scroll
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      selectedCase = .uikit
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      InputLabLog.event("auto matrix end")
    }
  }
  #endif
}

private struct BareTextFieldCaseView: View {
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Bare SwiftUI TextField (no NavigationStack, no ScrollView)")
        .font(.caption)
        .foregroundStyle(.secondary)
      TextField("Type here", text: $text)
        .textFieldStyle(.roundedBorder)
        .focused($focused)
        .simultaneousGesture(TapGesture().onEnded {
          InputLabLog.event("case1 tap")
        })
        .onChange(of: text) { old, new in
          if old.isEmpty, !new.isEmpty {
            InputLabLog.event("case1 first character")
          }
          InputLabLog.event("case1 onChange length=\(new.count)")
        }
      Text("Length: \(text.count)")
        .font(.footnote)
    }
    .padding()
    .onChange(of: focused) { _, new in
      InputLabLog.event("case1 focus=\(new)")
    }
    #if DEBUG
    .onAppear(perform: runAutoTypingIfRequested)
    #endif
  }

  #if DEBUG
  private func runAutoTypingIfRequested() {
    guard isInputLabAutoRunEnabled else { return }
    Task { @MainActor in
      InputLabLog.event("case1 synthetic tap")
      focused = true
      try? await Task.sleep(nanoseconds: 120_000_000)
      text = "ABCD"
    }
  }
  #endif
}

private struct NavigationStackTextFieldCaseView: View {
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 10) {
        Text("SwiftUI TextField inside NavigationStack")
          .font(.caption)
          .foregroundStyle(.secondary)
        TextField("Type here", text: $text)
          .textFieldStyle(.roundedBorder)
          .focused($focused)
          .simultaneousGesture(TapGesture().onEnded {
            InputLabLog.event("case2 tap")
          })
          .onChange(of: text) { old, new in
            if old.isEmpty, !new.isEmpty {
              InputLabLog.event("case2 first character")
            }
            InputLabLog.event("case2 onChange length=\(new.count)")
          }
        Text("Length: \(text.count)")
          .font(.footnote)
        Spacer()
      }
      .padding()
      .navigationTitle("Case 2")
    }
    .onChange(of: focused) { _, new in
      InputLabLog.event("case2 focus=\(new)")
    }
    #if DEBUG
    .onAppear(perform: runAutoTypingIfRequested)
    #endif
  }

  #if DEBUG
  private func runAutoTypingIfRequested() {
    guard isInputLabAutoRunEnabled else { return }
    Task { @MainActor in
      InputLabLog.event("case2 synthetic tap")
      focused = true
      try? await Task.sleep(nanoseconds: 120_000_000)
      text = "ABCD"
    }
  }
  #endif
}

private struct ScrollViewTextFieldCaseView: View {
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        Text("SwiftUI TextField inside ScrollView (no scrollDismissesKeyboard)")
          .font(.caption)
          .foregroundStyle(.secondary)
        TextField("Type here", text: $text)
          .textFieldStyle(.roundedBorder)
          .focused($focused)
          .simultaneousGesture(TapGesture().onEnded {
            InputLabLog.event("case3 tap")
          })
          .onChange(of: text) { old, new in
            if old.isEmpty, !new.isEmpty {
              InputLabLog.event("case3 first character")
            }
            InputLabLog.event("case3 onChange length=\(new.count)")
          }
        Text("Length: \(text.count)")
          .font(.footnote)
      }
      .padding()
    }
    .onChange(of: focused) { _, new in
      InputLabLog.event("case3 focus=\(new)")
    }
    #if DEBUG
    .onAppear(perform: runAutoTypingIfRequested)
    #endif
  }

  #if DEBUG
  private func runAutoTypingIfRequested() {
    guard isInputLabAutoRunEnabled else { return }
    Task { @MainActor in
      InputLabLog.event("case3 synthetic tap")
      focused = true
      try? await Task.sleep(nanoseconds: 120_000_000)
      text = "ABCD"
    }
  }
  #endif
}

private struct UIKitTextFieldCaseView: View {
  @State private var text = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("UIKit UITextField wrapper")
        .font(.caption)
        .foregroundStyle(.secondary)
      UIKitLoggedTextField(text: $text)
        .frame(height: 36)
      Text("Length: \(text.count)")
        .font(.footnote)
    }
    .padding()
    .onAppear {
      InputLabLog.event("case4 appear")
    }
  }
}

private struct UIKitLoggedTextField: UIViewRepresentable {
  @Binding var text: String

  func makeUIView(context: Context) -> UITextField {
    let field = UITextField(frame: .zero)
    field.borderStyle = .roundedRect
    field.placeholder = "Type here"
    field.delegate = context.coordinator
    field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
    #if DEBUG
    if isInputLabAutoRunEnabled {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
        InputLabLog.event("case4 synthetic tap")
        field.becomeFirstResponder()
        field.insertText("ABCD")
      }
    }
    #endif
    return field
  }

  func updateUIView(_ uiView: UITextField, context: Context) {
    if uiView.text != text {
      uiView.text = text
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(text: $text)
  }

  final class Coordinator: NSObject, UITextFieldDelegate {
    @Binding private var text: String

    init(text: Binding<String>) {
      _text = text
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
      InputLabLog.event("case4 editing begin")
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
      InputLabLog.event("case4 editing end")
    }

    func textFieldDidChangeSelection(_ textField: UITextField) {
      InputLabLog.event("case4 selection changed length=\((textField.text ?? "").count)")
    }

    func textField(
      _ textField: UITextField,
      shouldChangeCharactersIn range: NSRange,
      replacementString string: String
    ) -> Bool {
      let current = textField.text ?? ""
      guard let stringRange = Range(range, in: current) else { return true }
      let updated = current.replacingCharacters(in: stringRange, with: string)
      if current.isEmpty, !updated.isEmpty {
        InputLabLog.event("case4 first character")
      }
      InputLabLog.event("case4 shouldChange nextLength=\(updated.count)")
      return true
    }

    @objc func editingChanged(_ textField: UITextField) {
      let latest = textField.text ?? ""
      text = latest
      InputLabLog.event("case4 onChange length=\(latest.count)")
    }
  }
}
