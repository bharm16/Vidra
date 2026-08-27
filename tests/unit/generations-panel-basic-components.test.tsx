import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type React from "react";

import { VersionDivider } from "@features/generations/components/VersionDivider";
import { FaceMatchIndicator } from "@features/generations/components/KeyframeStep/FaceMatchIndicator";
import { VideoThumbnail } from "@features/generations/components/VideoThumbnail";
import { KeyframeOptionCard } from "@features/generations/components/KeyframeStep/KeyframeOptionCard";
import type { KeyframeOption } from "@features/generations/components/KeyframeStep/hooks/useKeyframeGeneration";

vi.mock("@promptstudio/system/components/ui/badge", () => ({
  Badge: ({
    className,
    children,
  }: {
    className?: string;
    children: React.ReactNode;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("@promptstudio/system/components/ui", () => ({
  Play: () => <span>play</span>,
  Check: () => <span>check</span>,
  DotsThree: () => <span>dots</span>,
  WarningCircle: () => <span>warn</span>,
}));

describe("VersionDivider", () => {
  describe("error handling", () => {
    it("omits the prompt changed label when prompt is unchanged", () => {
      render(<VersionDivider versionLabel="v1" promptChanged={false} />);
      expect(screen.queryByText(/prompt changed/i)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("includes prompt changed in the aria label", () => {
      render(<VersionDivider versionLabel="v2" promptChanged={true} />);
      const divider = screen.getByRole("separator");
      expect(divider).toHaveAttribute(
        "aria-label",
        "Version v2, prompt edited",
      );
    });
  });

  describe("core behavior", () => {
    it("renders the version label text", () => {
      render(<VersionDivider versionLabel="v3" promptChanged={false} />);
      expect(screen.getByText("v3")).toBeInTheDocument();
    });
  });
});

describe("FaceMatchIndicator", () => {
  describe("error handling", () => {
    it("renders a placeholder when score is missing", () => {
      render(<FaceMatchIndicator />);
      expect(screen.getByText("Face match: --")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("uses red styling for low scores", () => {
      render(<FaceMatchIndicator score={0.4} />);
      const label = screen.getByText("40% match");
      expect(label.className).toContain("text-red-400");
    });
  });

  describe("core behavior", () => {
    it("renders percentage and bar for high scores", () => {
      render(<FaceMatchIndicator score={0.85} />);
      expect(screen.getByText("85% match")).toBeInTheDocument();
      const bar = screen.getByText("85% match").nextSibling as HTMLElement;
      expect(bar.querySelector("div")?.style.width).toBe("85%");
    });
  });
});

describe("VideoThumbnail", () => {
  describe("error handling", () => {
    it("shows a fallback message when no media is available", () => {
      render(
        <VideoThumbnail
          videoUrl={null}
          thumbnailUrl={null}
          isGenerating={false}
        />,
      );
      expect(screen.getByText("No preview")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /play preview/i }),
      ).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("shows a shimmer placeholder while generating", () => {
      render(
        <VideoThumbnail videoUrl={null} thumbnailUrl={null} isGenerating />,
      );
      expect(
        screen.queryByRole("button", { name: /play preview/i }),
      ).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("renders a video element when a video url is available", () => {
      const { container } = render(
        <VideoThumbnail
          videoUrl="https://cdn/video.mp4"
          isGenerating={false}
        />,
      );
      expect(container.querySelector("video")).not.toBeNull();
    });
  });
});

describe("KeyframeOptionCard", () => {
  const keyframe: KeyframeOption = {
    imageUrl: "https://cdn/keyframe.png",
    faceStrength: 0.8,
    faceMatchScore: 0.7,
  };

  describe("error handling", () => {
    it("renders even when face match score is missing", () => {
      const keyframeWithoutFaceMatch: KeyframeOption = {
        imageUrl: keyframe.imageUrl,
        faceStrength: keyframe.faceStrength,
      };
      render(
        <KeyframeOptionCard
          keyframe={keyframeWithoutFaceMatch}
          isSelected={false}
          onSelect={() => {}}
        />,
      );
      expect(screen.getByAltText("Keyframe option")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("shows the selection checkmark when selected", () => {
      render(
        <KeyframeOptionCard
          keyframe={keyframe}
          isSelected
          onSelect={() => {}}
        />,
      );
      const button = screen.getByRole("button");
      expect(button.className).toContain("border-violet-500");
    });
  });

  describe("core behavior", () => {
    it("calls onSelect when clicked", () => {
      const onSelect = vi.fn();
      render(
        <KeyframeOptionCard
          keyframe={keyframe}
          isSelected={false}
          onSelect={onSelect}
        />,
      );

      fireEvent.click(screen.getByRole("button"));
      expect(onSelect).toHaveBeenCalled();
    });
  });
});
