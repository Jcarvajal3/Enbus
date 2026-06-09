import { useCssElement } from "react-native-css";
import React from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { Image as RNImage } from "expo-image";

const AnimatedExpoImage = Animated.createAnimatedComponent(RNImage);

export type ImageProps = React.ComponentProps<typeof RNImage>;

function CSSImage(props: React.ComponentProps<typeof AnimatedExpoImage>) {
  const { objectFit, objectPosition, ...style } =
    (StyleSheet.flatten(props.style) || {}) as any;

  return (
    <AnimatedExpoImage
      contentFit={objectFit as any}
      contentPosition={objectPosition as any}
      {...props}
      source={
        typeof props.source === "string" ? { uri: props.source } : props.source
      }
      style={style as any}
    />
  );
}

export const Image = (
  props: React.ComponentProps<typeof CSSImage> & { className?: string }
) => {
  return useCssElement(CSSImage, props, { className: "style" });
};

Image.displayName = "CSS(Image)";
