// Collection of functions to pass to pug templates for rendering

export function toggleShowElement(divId: string) {
    const element = document.querySelector(`#${divId}`)!;
    element.setAttribute("style", element.getAttribute("style") === "display: none" ? "display:" : "display: none");
}