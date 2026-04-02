// js/area.js - Áreas de trabajo del Sanatorio (FUENTE ÚNICA DE VERDAD)
const area = {
    "Personal Asistencial": [
        "Camilleros",
        "Asistentes",
        "Enfermeros",
        "Médicos",
        "Técnicos en Radiología",
        "Farmacia",
        "Laboratorio",
        "Kinesiología",
        "Nutrición",
        "Psicología",
        "Trabajo Social"
    ],
    "Personal Administrativo": [
        "Admisión",
        "Facturación",
        "Recursos Humanos",
        "Administración General",
        "Contaduría",
        "Compras",
        "Archivo Médico"
    ],
    "Personal de Soporte": [
        "Mantenimiento",
        "Limpieza",
        "Seguridad",
        "Informática/Sistemas",
        "Logística",
        "Cocina"
    ],
    "Personal General": [
        "Personal general del Sanatorio"
    ],
    "Otros": [
        "Otros profesionales de la salud"
    ]
};

// Función global para poblar cualquier select con las áreas
function poblarSelectAreas(selectElement, valorSeleccionado = '') {
    if (!selectElement) return;
    
    selectElement.innerHTML = '';
    
    // Opción vacía
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Seleccione un área';
    selectElement.appendChild(emptyOption);
    
    // Recorrer categorías y opciones
    for (const categoria in area) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = categoria;
        
        area[categoria].forEach(areaName => {
            const option = document.createElement('option');
            option.value = areaName;
            option.textContent = areaName;
            if (valorSeleccionado === areaName) {
                option.selected = true;
            }
            optgroup.appendChild(option);
        });
        
        selectElement.appendChild(optgroup);
    }
}

// Función para obtener todas las áreas como array plano
function obtenerTodasLasAreas() {
    const todas = [];
    for (const categoria in area) {
        todas.push(...area[categoria]);
    }
    return todas;
}

// Exponer funciones globalmente
window.areaData = {
    area: area,
    poblarSelectAreas: poblarSelectAreas,
    obtenerTodasLasAreas: obtenerTodasLasAreas
};

console.log('✅ Áreas de trabajo cargadas:', obtenerTodasLasAreas().length, 'opciones');