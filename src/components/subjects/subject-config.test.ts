import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createElement } from "react";
import { subjectConfigs } from "./subject-config";
import { FeatureGrid } from "./FeatureGrid";
import { SubjectHero } from "./SubjectHero";

describe("subject art configuration", () => {
  it("assigns a distinct art direction to every subject", () => {
    expect(Object.fromEntries(Object.entries(subjectConfigs).map(([key, value]) => [key, value.artDirection]))).toEqual({
      english: "paper",
      math: "calm",
      specialty: "bookshelf",
      politics: "newsroom",
    });
  });

  it("uses varied semantic feature roles instead of an equal card grid", () => {
    expect(subjectConfigs.math.features.map(({ layout }) => layout)).toEqual(["floating", "wide", "compact", "strip"]);
    expect(subjectConfigs.specialty.features.map(({ layout }) => layout)).toEqual([
      "shelf", "shelf", "paper", "paper", "paper", "paper", "shelf", "strip",
    ]);
    expect(subjectConfigs.politics.features.map(({ layout }) => layout)).toEqual([
      "headline", "accent", "compact", "accent", "wide", "compact", "strip",
    ]);
  });
});

describe("subject navigation", () => {
  it.each(Object.entries(subjectConfigs))("links every %s feature directly to its configured workspace", (_id, config) => {
    render(createElement(MemoryRouter, null, createElement(FeatureGrid, { config })));
    for (const feature of config.features) {
      expect(screen.getByRole("link", { name: `${feature.title}：${feature.description}` })).toHaveAttribute("href", feature.path);
    }
  });

  it.each(Object.entries(subjectConfigs))("does not send the %s hero to a placeholder route", (_id, config) => {
    render(createElement(MemoryRouter, null, createElement(SubjectHero, { config })));
    expect(screen.getByRole("link", { name: "查看详情" })).toHaveAttribute("href", config.features[0].path);
    expect(screen.getByRole("link", { name: "查看详情" }).getAttribute("href")).not.toContain("/planned/");
  });
});
