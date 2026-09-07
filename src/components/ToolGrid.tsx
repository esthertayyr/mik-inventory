import { Children, type ReactNode, useState } from "react";
import { View } from "react-native";

/** Measure the available space so gaps never force the final card off screen. */
export function ToolGrid({ children, minCardWidth = 140, maxColumns = 4 }: { children: ReactNode; minCardWidth?: number; maxColumns?: number }) {
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.min(maxColumns, Math.floor((width + 12) / (minCardWidth + 12))));
  const gap = 12;
  const cellWidth = width ? (width - gap * (columns - 1)) / columns : "100%";
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap, alignItems: "stretch" }}>
      {Children.map(children, (child) => (
        <View style={{ width: cellWidth, minWidth: 0 }}>{child}</View>
      ))}
    </View>
  );
}
