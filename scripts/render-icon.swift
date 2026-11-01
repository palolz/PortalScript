// Renders build/icon.png from the orange UI logo: swift scripts/render-icon.swift build/icon.png
import AppKit

let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
func c(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
// AppKit origin is bottom-left.
let tileRect = NSRect(x: 100, y: 100, width: 824, height: 824)
let tile = NSBezierPath(roundedRect: tileRect, xRadius: 185, yRadius: 185)

// Tile shadow
ctx.saveGState()
let sh = NSShadow(); sh.shadowColor = c(0x000000, 0.35); sh.shadowBlurRadius = 28; sh.shadowOffset = NSSize(width: 0, height: -12); sh.set()
c(0xd6d2c9).setFill(); tile.fill()
ctx.restoreGState()

// Plastic body: warm grey gradient + grain
ctx.saveGState()
tile.addClip()
NSGradient(colors: [c(0xefebe2), c(0xd9d4ca), c(0xc6c0b5)], atLocations: [0, 0.55, 1], colorSpace: .sRGB)!.draw(in: tileRect, angle: -90)
srand48(7)
for _ in 0..<60000 {
  let x = 100 + drand48() * 824, y = 100 + drand48() * 824
  (drand48() < 0.5 ? c(0x000000, 0.045) : c(0xffffff, 0.06)).setFill()
  NSRect(x: x, y: y, width: 1.6, height: 1.6).fill()
}
ctx.restoreGState()
// Bevel: a thin ring that fades from a light top edge to a darker bottom edge
let ring = NSBezierPath(roundedRect: tileRect, xRadius: 185, yRadius: 185)
ring.append(NSBezierPath(roundedRect: tileRect.insetBy(dx: 5, dy: 5), xRadius: 180, yRadius: 180))
ring.windingRule = .evenOdd
ctx.saveGState(); ring.addClip()
NSGradient(colors: [c(0xffffff, 0.7), c(0xffffff, 0.1), c(0x000000, 0.08), c(0x000000, 0.2)], atLocations: [0, 0.45, 0.55, 1], colorSpace: .sRGB)!.draw(in: tileRect, angle: -90)
ctx.restoreGState()

// Logo, scaled from the 48px UI badge (r 22.5 -> 300)
let k: CGFloat = 300 / 22.5
let center = NSPoint(x: 512, y: 512)
func circle(_ r: CGFloat) -> NSBezierPath { NSBezierPath(ovalIn: NSRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)) }

let disc = circle(22.5 * k)
ctx.saveGState()
let ds = NSShadow(); ds.shadowColor = c(0x1c1c1a, 0.45); ds.shadowBlurRadius = 18; ds.shadowOffset = NSSize(width: 0, height: -14); ds.set()
c(0xe6802e).setFill(); disc.fill()
ctx.restoreGState()
ctx.saveGState(); disc.addClip()
NSGradient(colors: [c(0xf4a05a), c(0xe6802e), c(0xc9661d)], atLocations: [0, 0.5, 1], colorSpace: .sRGB)!
  .draw(in: disc.bounds, angle: -90)
// soft specular on the upper half
NSGradient(colors: [c(0xffffff, 0.28), c(0xffffff, 0)])!.draw(in: circle(22.5 * k), relativeCenterPosition: NSPoint(x: -0.25, y: 0.55))
ctx.restoreGState()
c(0x141413).setStroke(); disc.lineWidth = 1.5 * k; disc.stroke()

let hole = circle(8 * k)
ctx.saveGState()
let hs = NSShadow(); hs.shadowColor = c(0xffffff, 0.35); hs.shadowBlurRadius = 2; hs.shadowOffset = NSSize(width: 0, height: -4); hs.set()
c(0x141413).setFill(); hole.fill()
ctx.restoreGState()
let dot = circle(2.4 * k)
c(0xe6802e).setFill(); dot.fill()
NSGradient(colors: [c(0xffffff, 0.35), c(0xffffff, 0)])!.draw(in: dot, relativeCenterPosition: NSPoint(x: -0.3, y: 0.4))

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
