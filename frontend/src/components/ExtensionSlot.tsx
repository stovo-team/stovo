import React, { ComponentType } from "react";

export type SlotComponent<P = any> = ComponentType<P>;

class ExtensionRegistry {
  private slots: Map<string, SlotComponent[]> = new Map();

  register(slotName: string, component: SlotComponent): () => void {
    const list = this.slots.get(slotName) || [];
    this.slots.set(slotName, [...list, component]);

    return () => {
      const current = this.slots.get(slotName) || [];
      this.slots.set(
        slotName,
        current.filter((c) => c !== component)
      );
    };
  }

  getComponents(slotName: string): SlotComponent[] {
    return this.slots.get(slotName) || [];
  }

  clear(): void {
    this.slots.clear();
  }
}

export const extensionRegistry = new ExtensionRegistry();

export interface ExtensionSlotProps {
  name: string;
  context?: Record<string, any>;
  className?: string;
}

export const ExtensionSlot: React.FC<ExtensionSlotProps> = ({
  name,
  context = {},
  className = "extension-slot",
}) => {
  const components = extensionRegistry.getComponents(name);

  if (components.length === 0) return null;

  return (
    <div className={className} data-slot-name={name}>
      {components.map((Comp, idx) => (
        <Comp key={`${name}-${idx}`} {...context} />
      ))}
    </div>
  );
};
