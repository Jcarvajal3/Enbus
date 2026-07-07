import {
  useCssElement,
  useNativeVariable as useFunctionalVariable,
} from "react-native-css";

import { Link as RouterLink } from "expo-router";
import Animated from "react-native-reanimated";
import React from "react";
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

export const Link = (
  props: React.ComponentProps<typeof RouterLink> & { className?: string }
) => {
  return useCssElement(RouterLink, props, { className: "style" });
};

Link.Trigger = RouterLink.Trigger;
Link.Menu = RouterLink.Menu;
Link.MenuAction = RouterLink.MenuAction;
Link.Preview = RouterLink.Preview;

export const useCSSVariable =
  process.env.EXPO_OS !== "web"
    ? useFunctionalVariable
    : (variable: string) => `var(${variable})`;

export type ViewProps = React.ComponentProps<typeof RNView> & {
  className?: string;
};

export const View = (props: ViewProps) => {
  return useCssElement(RNView, props, { className: "style" });
};
View.displayName = "CSS(View)";

// --- Font Family Resolver ---
// CSS variables cannot drive `fontFamily` on native components.
// We inspect className and inject the correct Lora variant as a native style prop.
// IMPORTANT: More specific keys must come first to avoid false substring matches.
// e.g. 'font-heading-semi' must precede 'font-heading' so it is checked first.
const FONT_MAP: [string, string][] = [
  ['font-heading-semi', 'Lora-SemiBold'],
  ['font-heading', 'Lora-Bold'],
];

function resolveFont(className?: string): string | undefined {
  if (!className) return undefined;
  // Split by whitespace to get individual class tokens for exact matching.
  const classes = className.split(/\s+/);
  for (const [cls, family] of FONT_MAP) {
    if (classes.includes(cls)) return family;
  }
  return undefined;
}

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string }
) => {
  const loraFamily = resolveFont(props.className);
  const fontStyle = loraFamily ? [{ fontFamily: loraFamily }] : [];
  const mergedStyle = [...fontStyle, props.style].filter(Boolean);
  return useCssElement(
    RNText,
    { ...props, style: mergedStyle },
    { className: "style" }
  );
};
Text.displayName = "CSS(Text)";

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  }
) => {
  return useCssElement(RNScrollView, props, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
  });
};
ScrollView.displayName = "CSS(ScrollView)";

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string }
) => {
  return useCssElement(RNPressable, props, { className: "style" });
};
Pressable.displayName = "CSS(Pressable)";

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string }
) => {
  const loraFamily = resolveFont(props.className);
  const fontStyle = loraFamily ? [{ fontFamily: loraFamily }] : [];
  const mergedStyle = [...fontStyle, props.style].filter(Boolean);
  return useCssElement(RNTextInput, { ...props, style: mergedStyle }, { className: "style" });
};
TextInput.displayName = "CSS(TextInput)";

export const AnimatedScrollView = (
  props: React.ComponentProps<typeof Animated.ScrollView> & {
    className?: string;
    contentClassName?: string;
    contentContainerClassName?: string;
  }
) => {
  return useCssElement(Animated.ScrollView, props, {
    className: "style",
    contentClassName: "contentContainerStyle",
    contentContainerClassName: "contentContainerStyle",
  });
};

function XXTouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight>
) {
  const { underlayColor, ...style } = (StyleSheet.flatten(props.style) || {}) as any;
  return (
    <RNTouchableHighlight
      underlayColor={underlayColor}
      {...props}
      style={style}
    />
  );
}

export const TouchableHighlight = (
  props: React.ComponentProps<typeof RNTouchableHighlight>
) => {
  return useCssElement(XXTouchableHighlight, props, { className: "style" });
};
TouchableHighlight.displayName = "CSS(TouchableHighlight)";

export const SafeAreaView = (props: React.ComponentProps<typeof RNSafeAreaView> & { className?: string }) => {
  return useCssElement(RNSafeAreaView, props, { className: "style" });
};
SafeAreaView.displayName = "CSS(SafeAreaView)";
