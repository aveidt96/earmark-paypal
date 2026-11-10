function unavailable(): never {
  throw new Error("LEGACY_WEB_PROFILE_DISABLED");
}

export {
  unavailable as ActivityPage,
  unavailable as CreateMandate,
  unavailable as Dashboard,
  unavailable as ExecutionPage,
  unavailable as MandatesPage,
  unavailable as Navigation,
  unavailable as Notices,
  unavailable as PaymentResolution,
  unavailable as PaymentsPage,
  unavailable as SecurityDemos,
  unavailable as WorkspaceProvider,
};
