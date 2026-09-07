import { Platform, Text as NativeText, TextInput as NativeInput, type TextProps, type TextInputProps } from "react-native";

const family = Platform.select({
  web: "Arial, Helvetica, sans-serif",
  ios: "System",
  default: "sans-serif",
});

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: family }, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeInput {...props} style={[{ fontFamily: family }, style]} />;
}
