import type { ReactNode } from "react";
import { Platform, View } from "react-native";

export function FormActionBar({ children }: { children: ReactNode }) {
  return <View style={[{ backgroundColor: "#FFFFFF", paddingBottom: 12, paddingTop: 8, marginTop: 12, borderTopWidth: 1, borderTopColor: "#E0E3E7" },
    Platform.OS === "web" ? { position: "sticky", bottom: 0, zIndex: 2 } as any : null]}>{children}</View>;
}
