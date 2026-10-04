import { Alert, Platform } from 'react-native';

/** Native Alert is a no-op on React Native Web. Keep validation visible there. */
export function userNotice(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert([title, message].filter(Boolean).join('\n\n'));
  } else {
    Alert.alert(title, message);
  }
}
