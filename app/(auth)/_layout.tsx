// app/(auth)/_layout.tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="license" />
      <Stack.Screen name="pairing" />
      <Stack.Screen name="login" />
    </Stack>
  );
}