// js/area.js - Áreas de trabajo del Sanatorio
const area = {
    "Personal de enfermeria": [
        "Enfermeros",
        "Camilleros",
        "Asistentes",
        "Técnicos en prácticas cardiológicas"
    ],
    "Profesionales": [
        "Medicos",
        "Kinesiólogos",
        "Nutricionistas",
        "Obstétricas"
    ],
    "Personal de apoyo y administrativo": [
        "Mucamas",
        "Camareras",
        "Personal de limpieza",
        "Personal administrativo"
    ],
};

// Función para poblar selects
function poblarSelectAreas(selectElement, valorSeleccionado = '') {
    if (!selectElement) return;
    
    selectElement.innerHTML = '<option value="">Seleccione un área</option>';
    
    for (const categoria in area) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = categoria;
        
        area[categoria].forEach(areaName => {
            const option = document.createElement('option');
            option.value = areaName;
            option.textContent = areaName;
            if (valorSeleccionado === areaName) option.selected = true;
            optgroup.appendChild(option);
        });
        
        selectElement.appendChild(optgroup);
    }
}

// Exponer GLOBALMENTE tanto la variable como la función
window.area = area;  // 👈 ESTA LÍNEA ES LA CLAVE
window.poblarSelectAreas = poblarSelectAreas;

// Auto-poblar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    const updateAreaSelect = document.getElementById('updateArea');
    if (updateAreaSelect) {
        poblarSelectAreas(updateAreaSelect, '');
        console.log('✅ Select de áreas poblado');
    }
});

console.log('✅ Áreas de trabajo cargadas');