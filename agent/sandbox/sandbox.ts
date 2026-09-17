import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  revalidationKey: () => "headlong-sandbox-v1",
  async bootstrap({ use }) {
    await use();
  },
  async onSession({ use }) {
    await use();
  }
});
