import { Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, type TextProps, type TextInputProps, type TextStyle } from "react-native";

const family = Platform.select({
  web: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
  ios: "System",
  default: "sans-serif",
});

// One restrained type scale keeps every screen visually related. Very small
// product badges keep their compact size; all normal interface copy snaps to
// the same shared scale.
const typeScale = [12, 14, 16, 18, 20, 24, 28, 34, 40, 46, 48];
const nearestSize = (value?: number) => {
  if (!value || value <= 10) return value;
  return typeScale.reduce((best, size) =>
    Math.abs(size - value) < Math.abs(best - value) ? size : best,
  );
};
const normalized = (style: TextProps["style"]): TextStyle => {
  const flat = StyleSheet.flatten(style) ?? {};
  const numericWeight = Number(flat.fontWeight);
  return {
    fontSize: nearestSize(typeof flat.fontSize === "number" ? flat.fontSize : undefined),
    fontWeight: Number.isFinite(numericWeight) && numericWeight >= 600 ? "700" : flat.fontWeight,
  };
};

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: family }, style, normalized(style)]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeInput {...props} style={[{ fontFamily: family }, style, { fontSize: 16 }]} />;
}
