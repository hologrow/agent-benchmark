import { Suspense } from "react";

const SettingLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <Suspense>{children}</Suspense>;
};

export default SettingLayout;
