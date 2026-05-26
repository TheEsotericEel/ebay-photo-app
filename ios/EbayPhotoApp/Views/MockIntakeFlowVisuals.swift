import SwiftUI

struct CaptureFlowBackground: View {
  var body: some View {
    LinearGradient(
      colors: [
        Color(red: 0.07, green: 0.08, blue: 0.10),
        Color.black
      ],
      startPoint: .top,
      endPoint: .bottom
    )
    .ignoresSafeArea()
  }
}

struct CaptureTopCapsuleButton: View {
  let title: String
  let systemName: String?
  var isFilled = false
  var foreground: Color = .white
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let systemName {
          Image(systemName: systemName)
            .font(.subheadline.weight(.semibold))
        }
        Text(title)
          .font(.subheadline.weight(.medium))
      }
      .foregroundStyle(foreground)
      .padding(.horizontal, 14)
      .padding(.vertical, 9)
      .background {
        Capsule(style: .continuous)
          .fill(isFilled ? .white : .white.opacity(0.08))
      }
      .overlay {
        Capsule(style: .continuous)
          .stroke(isFilled ? .clear : .white.opacity(0.1), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
  }
}

struct CaptureFlowHero: View {
  let eyebrow: String
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(eyebrow.uppercased())
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(title)
        .font(.largeTitle.weight(.bold))
        .foregroundStyle(.white)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct CaptureSurfaceCard<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(.white.opacity(0.06))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
  }
}

struct CaptureStatusChip: View {
  let title: String

  var body: some View {
    Text(title)
      .font(.caption.weight(.semibold))
      .foregroundStyle(.white)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background {
        Capsule()
          .fill(.white.opacity(0.08))
      }
  }
}

struct CaptureCameraPreviewSurface: View {
  let photoCount: Int
  let seed: Int?
  let gridEnabled: Bool
  let levelEnabled: Bool
  let selectedLens: String

  var body: some View {
    RoundedRectangle(cornerRadius: 22, style: .continuous)
      .fill(
        LinearGradient(
          colors: [
            Color(red: 0.12, green: 0.12, blue: 0.14),
            Color(red: 0.06, green: 0.06, blue: 0.07)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
      .aspectRatio(1, contentMode: .fit)
      .overlay {
        if let seed, photoCount > 0 {
          CaptureCameraScene(seed: seed)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(10)
        }
      }
      .overlay {
        CaptureViewfinderCorners()
          .padding(16)
      }
      .overlay {
        if gridEnabled {
          CapturePreviewGrid()
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
      }
      .overlay {
        Circle()
          .stroke(.white.opacity(0.92), lineWidth: 2)
          .frame(width: 70, height: 70)
      }
      .overlay {
        if levelEnabled {
          Rectangle()
            .fill(.white.opacity(0.5))
            .frame(height: 2)
            .padding(.horizontal, 18)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        Text(selectedLens)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 13)
          .padding(.vertical, 9)
          .background {
            Capsule(style: .continuous)
              .fill(.black.opacity(0.52))
          }
          .overlay {
            Capsule(style: .continuous)
              .stroke(.white.opacity(0.78), lineWidth: 1.6)
          }
          .padding(.trailing, 16)
          .padding(.bottom, 16)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(.white.opacity(0.10), lineWidth: 1)
      }
  }
}

struct CaptureCameraThumbnailPanel: View {
  let seed: Int?
  let hasPhoto: Bool
  let photoCount: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Group {
        if let seed, hasPhoto {
          CaptureCameraScene(seed: seed)
        } else {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(.white.opacity(0.08))
            .overlay {
              Image(systemName: "photo")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.secondary)
            }
        }
      }
      .frame(width: 72, height: 72)
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
      .overlay(alignment: .topTrailing) {
        if hasPhoto {
          Text("#\(photoCount)")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background {
              Capsule(style: .continuous)
                .fill(.black.opacity(0.55))
            }
            .padding(6)
        }
      }

      Text(hasPhoto ? "Last photo" : "No photo")
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
    }
  }
}

struct CaptureCameraScene: View {
  let seed: Int

  private var bookColor: Color {
    switch seed % 4 {
    case 0:
      return Color(red: 0.40, green: 0.27, blue: 0.18)
    case 1:
      return Color(red: 0.18, green: 0.32, blue: 0.40)
    case 2:
      return Color(red: 0.46, green: 0.22, blue: 0.16)
    default:
      return Color(red: 0.32, green: 0.30, blue: 0.18)
    }
  }

  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width
      let height = geometry.size.height

      ZStack {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(
            LinearGradient(
              colors: [
                Color(red: 0.28, green: 0.20, blue: 0.15),
                Color(red: 0.17, green: 0.12, blue: 0.10)
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )

        VStack(spacing: 0) {
          ForEach(0 ..< 7, id: \.self) { row in
            Rectangle()
              .fill(row.isMultiple(of: 2) ? .white.opacity(0.06) : .black.opacity(0.10))
              .frame(height: height / 7.5)
          }
        }
        .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -11 : -8))
        .scaleEffect(1.18)

        RoundedRectangle(cornerRadius: width * 0.07, style: .continuous)
          .fill(bookColor)
          .frame(width: width * 0.44, height: height * 0.23)
          .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -16 : -11))
          .offset(x: -width * 0.09, y: height * 0.11)
          .shadow(color: .black.opacity(0.25), radius: 18, x: 0, y: 14)
          .overlay(alignment: .leading) {
            Rectangle()
              .fill(.white.opacity(0.18))
              .frame(width: width * 0.03)
              .padding(.vertical, 8)
          }

        RoundedRectangle(cornerRadius: width * 0.035, style: .continuous)
          .fill(Color(red: 0.31, green: 0.34, blue: 0.38))
          .frame(width: width * 0.32, height: height * 0.15)
          .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -19 : -14))
          .offset(x: width * 0.18, y: -height * 0.01)
          .shadow(color: .black.opacity(0.25), radius: 16, x: 0, y: 12)
          .overlay {
            Circle()
              .stroke(.white.opacity(0.55), lineWidth: 3)
              .frame(width: width * 0.11, height: width * 0.11)
          }

        LinearGradient(
          colors: [.clear, .black.opacity(0.22)],
          startPoint: .top,
          endPoint: .bottom
        )
      }
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
  }
}

struct CapturePreviewGrid: View {
  var body: some View {
    GeometryReader { geometry in
      Path { path in
        let width = geometry.size.width
        let height = geometry.size.height

        path.move(to: CGPoint(x: width / 3, y: 0))
        path.addLine(to: CGPoint(x: width / 3, y: height))

        path.move(to: CGPoint(x: 2 * width / 3, y: 0))
        path.addLine(to: CGPoint(x: 2 * width / 3, y: height))

        path.move(to: CGPoint(x: 0, y: height / 3))
        path.addLine(to: CGPoint(x: width, y: height / 3))

        path.move(to: CGPoint(x: 0, y: 2 * height / 3))
        path.addLine(to: CGPoint(x: width, y: 2 * height / 3))
      }
      .stroke(.white.opacity(0.38), lineWidth: 1)
    }
  }
}

struct CaptureViewfinderCorners: View {
  var body: some View {
    ZStack {
      corner(x: .leading, y: .top, rotation: 0)
      corner(x: .trailing, y: .top, rotation: 90)
      corner(x: .leading, y: .bottom, rotation: 270)
      corner(x: .trailing, y: .bottom, rotation: 180)
    }
  }

  private func corner(x: HorizontalAlignment, y: VerticalAlignment, rotation: Double) -> some View {
    RoundedRectangle(cornerRadius: 4, style: .continuous)
      .stroke(.white.opacity(0.92), lineWidth: 2)
      .frame(width: 18, height: 18)
      .mask(
        VStack {
          if y == .top { Spacer() }
          HStack {
            if x == .leading { Spacer() }
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(.white)
              .frame(width: 18, height: 18)
            if x == .trailing { Spacer() }
          }
          if y == .bottom { Spacer() }
        }
      )
      .rotationEffect(.degrees(rotation))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment(x: x, y: y))
  }

  private func alignment(x: HorizontalAlignment, y: VerticalAlignment) -> Alignment {
    switch (x, y) {
    case (.leading, .top): return .topLeading
    case (.trailing, .top): return .topTrailing
    case (.leading, .bottom): return .bottomLeading
    case (.trailing, .bottom): return .bottomTrailing
    default: return .center
    }
  }
}
