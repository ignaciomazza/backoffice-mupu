// src/components/template-config/TemplateConfigForm.tsx
"use client";
import React from "react";
import { type Config } from "./types";
import StylesSection from "./sections/StylesSection";
import CoverSection from "./sections/CoverSection";
import ContactSection from "./sections/ContactSection";
import PaymentSection from "./sections/PaymentSection";
import ContentBuilderSection from "./sections/ContentBuilderSection";

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

const TemplateConfigForm: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  return (
    <>
      <StylesSection cfg={cfg} disabled={disabled} onChange={onChange} />
      <CoverSection cfg={cfg} disabled={disabled} onChange={onChange} />
      <ContactSection cfg={cfg} disabled={disabled} onChange={onChange} />
      <PaymentSection cfg={cfg} disabled={disabled} onChange={onChange} />
      <ContentBuilderSection
        cfg={cfg}
        disabled={disabled}
        onChange={onChange}
      />
    </>
  );
};

export default TemplateConfigForm;
