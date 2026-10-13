import AppKit
import Foundation

// Usage: swift scripts/create-icons.swift <master.png> <output-directory>
let source = CommandLine.arguments[1]
let directory = CommandLine.arguments[2]
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
guard let bitmap = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: source))),
      let original = bitmap.cgImage else {
    fatalError("Cannot decode the icon master")
}
for size in [16, 32, 48, 64, 128, 256, 512, 1024] {
    guard let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { fatalError("Cannot create icon bitmap") }
    context.interpolationQuality = .high
    let scale = min(CGFloat(size) / CGFloat(original.width), CGFloat(size) / CGFloat(original.height))
    let width = CGFloat(original.width) * scale
    let height = CGFloat(original.height) * scale
    context.draw(original, in: CGRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - height) / 2, width: width, height: height))
    guard let image = context.makeImage(),
          let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode icon bitmap")
    }
    try png.write(to: URL(fileURLWithPath: "\(directory)/\(size).png"))
}
