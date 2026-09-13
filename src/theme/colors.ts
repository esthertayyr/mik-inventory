/** One meaning for each action colour throughout MIK. */
export const UI_COLORS = {
  ink: "#111522",
  muted: "#626A78",
  border: "#E0E3EA",
  white: "#FFFFFF",
  brand: "#29315C",
  actionBlue: "#315FBE",       // selling and printing
  actionBlueSoft: "#EEF3FF",
  actionBlueBorder: "#C9D7F2",
  orderPurple: "#594C8D",     // customer orders
  orderPurpleSoft: "#F3F1F8",
  orderPurpleBorder: "#DFDAEB",
  successGreen: "#1B685C",    // paid, ready and completed
  successGreenSoft: "#EEF6F3",
  successGreenBorder: "#D3E6DF",
  alertRed: "#8A365B",        // money owed, stopping or removing
  alertRedSoft: "#FAF0F2",
  alertRedBorder: "#EACFDA",
  neutral: "#4B5158",         // ordinary stock, reports and settings
  neutralSoft: "#F3F4F5",
  neutralBorder: "#DFE1E3",
} as const;
