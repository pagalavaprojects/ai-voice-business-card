# Motion & Framer Motion Animation Guidelines

## 1. Pulse Wave Animation (Listening State)
```tsx
export const pulseVariants = {
  idle: { scale: 1, opacity: 0.3 },
  listening: {
    scale: [1, 1.2, 1],
    opacity: [0.4, 0.8, 0.4],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};
```

## 2. Card Entrance Transition
```tsx
export const cardEntrance = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};
```
