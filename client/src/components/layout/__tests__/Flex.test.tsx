import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Flex } from "../Flex";

const getFlex = (container: HTMLElement) => container.querySelector("div");

describe("Flex", () => {
  describe("error handling", () => {
    it("renders gap token as inline style and omits utility class", () => {
      const { container } = render(<Flex gap="ps-4" />);

      const flex = getFlex(container);
      expect(flex).not.toBeNull();
      expect(flex).toHaveStyle({ gap: "var(--space-3)" });
      expect(flex).not.toHaveClass("gap-ps-4");
    });

    it("keeps gap class when token is not a system token", () => {
      const { container } = render(<Flex gap="6" />);

      const flex = getFlex(container);
      expect(flex).not.toBeNull();
      expect(flex).toHaveClass("gap-6");
    });
  });

  describe("edge cases", () => {
    it("builds responsive gap classes", () => {
      const { container } = render(<Flex gap={{ base: "2", md: "4" }} />);

      const flex = getFlex(container);
      expect(flex).not.toBeNull();
      expect(flex).toHaveClass("gap-2");
      expect(flex).toHaveClass("md:gap-4");
    });

    it("maps direction, alignment, and wrap props to classes", () => {
      const { container } = render(
        <Flex
          direction="column"
          align="center"
          justify="between"
          wrap="wrap"
        />,
      );

      const flex = getFlex(container);
      expect(flex).not.toBeNull();
      expect(flex).toHaveClass("flex-col");
      expect(flex).toHaveClass("items-center");
      expect(flex).toHaveClass("justify-between");
      expect(flex).toHaveClass("flex-wrap");
    });
  });

  describe("core behavior", () => {
    it("always renders a flex container", () => {
      const { container } = render(<Flex />);

      const flex = getFlex(container);
      expect(flex).not.toBeNull();
      expect(flex).toHaveClass("flex");
    });
  });
});
