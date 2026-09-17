import { defineSandbox } from "eve/sandbox";

export default defineSandbox(({ parent }) => {
  if (!parent) throw new Error("The worker exists only as a child.");
  return parent.sandbox;
});
