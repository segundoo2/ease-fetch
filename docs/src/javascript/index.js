const CONFIG = {
  sections: [
    "intro",
    "quick-start",
    "conceitos",
    "avancado",
    "erros",
    "exemplos",
    "api",
  ],
  offset: 150,
};

const SectionService = {
  async fetch(id) {
    try {
      const response = await fetch(`./src/sections/${id}.html`);
      return response.ok ? await response.text() : "";
    } catch {
      return "";
    }
  },
};

const UI = {
  async init() {
    await Promise.all(
      CONFIG.sections.map(async (id) => {
        const html = await SectionService.fetch(id);
        const container = document.getElementById(id);
        if (container) container.innerHTML = html;
      })
    );

    this.setupNavigation();
  },

  setupNavigation() {
    const links = document.querySelectorAll("nav a");

    const updateActive = () => {
      let current = "";
      document.querySelectorAll(".content-block").forEach((section) => {
        if (window.pageYOffset >= section.offsetTop - CONFIG.offset) {
          current = section.getAttribute("id");
        }
      });

      links.forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href") === `#${current}`) {
          link.classList.add("active");
        }
      });
    };

    window.addEventListener("scroll", updateActive);
    updateActive();
  },
};

document.addEventListener("DOMContentLoaded", () => UI.init());
