// Collection of functions to pass to pug templates for rendering

export function toggleShowElement(divId: string) {
    const element = document.querySelector(`#${divId}`)!;
    const style = element.getAttribute("style");
    element.setAttribute("style", style === "display: none" || style === undefined ? "display:" : "display: none");
}

export function isFormTextValueValid(form: any, fieldName: string) {
    const value = form[fieldName].value;
    if (value == "") {
        alert(`${fieldName} must be filled out`);
        return false;
    }
    return true;
}

export function stringifyForm(form: any) {
    const formData = new FormData(form);
    const formObject = Object.fromEntries(formData.entries());
    return JSON.stringify(formObject); 
}

export function setB64FormFieldFromImage(form: any, fileInputFieldName: string, b64FieldName: string) {
    const logoFileElement = form[fileInputFieldName];
    const files = logoFileElement.files;
    if (files && files.length > 0) {
        // Assume a single file
        const file = files[0];
        const reader = new FileReader();

        reader.onload = function (e) {
            // The result is a Data URL (e.g., "data:image/jpeg;base64,<the stuff we want as b64 data>")
            const dataUrl = e.target?.result as string;
            const base64String = dataUrl ? dataUrl.split(',')[1] : ''; 

            const b64FormElement = form[b64FieldName];
            b64FormElement.value = base64String;
        };

        reader.readAsDataURL(file);
    }
}