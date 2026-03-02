class CalendarManager {
    constructor() {
        this.selectedClasses = new Set();
        this.classesData = this.initializeClassesData();
        this.init();
    }

    // Inicializar datos de clases
    initializeClassesData() {
        return [
            {
                id: 1,
                title: "Registro informatizado y auditoría",
                date: "2026-02-05",
                displayDate: "05/02/2026",
                time: "10:00",
                displayTime: "10:00hs",
                endTime: "11:00",
                modality: "Virtual",
                instructor: "Lic. Walter Rolón",
                location: "Microsoft Teams",
            },
            {
                id: 2,
                title: "Gestion administrativa e indicadores",
                date: "2026-03-12",
                displayDate: "12/03/2026",
                time: "10:00",
                displayTime: "10:00hs",
                endTime: "11:00",
                modality: "Presencial",
                instructor: "Lic. Rosa Monzón y Lic. Flor Alvarez",
                location: "Aula a confirmar",
            },
            {
                id: 3,
                title: "Aspectos legales de la practica profesional",
                date: "2026-03-19",
                displayDate: "19/03/2026",
                time: "10:00",
                displayTime: "10:00hs",
                endTime: "11:00",
                modality: "Virtual",
                instructor: "Lic. Walter Rolón y Lic. Elena Rastenes",
                location: "Microsoft Teams",
            },
            {
                id: 4,
                title: "Gestion de cuidados de piel",
                date: "2026-03-25",
                displayDate: "25/03/2026",
                time: "10:00",
                displayTime: "10:00hs",
                endTime: "11:00",
                modality: "Virtual",
                instructor: "Lic. Yesica Ceballos y Lic. Analía Garay",
                location: "Microsoft Teams",
            },
            {
                id: 5,
                title: "Gestion de vacaciones",
                date: "2026-04-01",
                displayDate: "01/04/2026",
                time: "15:30",
                displayTime: "15:30hs",
                endTime: "16:30",
                modality: "Virtual",
                instructor: "Lic. Yesica Ceballos y Lic. Analía Garay",
                location: "Microsoft Teams",
            }
        ];
    }

    // Renderizar las clases en el HTML
    renderClasses() {
        const container = document.querySelector('.calendar-classes-list');
        if (!container) {
            console.warn('No se encontró el contenedor .calendar-classes-list');
            return;
        }
        
        // Buscar elementos importantes dentro del container
        const title = container.querySelector('h4');
        const calendarActions = container.querySelector('.calendar-actions');
        const selectionPreview = container.querySelector('.selection-preview');
        
        // Guardar los elementos que NO son tarjetas de clase
        const elementosAMantener = [];
        if (title) elementosAMantener.push(title);
        if (calendarActions) elementosAMantener.push(calendarActions);
        if (selectionPreview) elementosAMantener.push(selectionPreview);
        
        // Limpiar SOLO las tarjetas de clase
        const children = Array.from(container.children);
        children.forEach(child => {
            // Si el elemento no está en la lista de elementos a mantener, lo removemos
            if (!elementosAMantener.includes(child) && !child.classList.contains('calendar-class-card')) {
                child.remove();
            }
        });
        
        // Remover todas las tarjetas existentes
        const tarjetasExistentes = container.querySelectorAll('.calendar-class-card');
        tarjetasExistentes.forEach(tarjeta => tarjeta.remove());
        
        // Renderizar cada clase
        this.classesData.forEach(cls => {
            const classCard = document.createElement('div');
            classCard.className = 'calendar-class-card';
            classCard.dataset.classId = cls.id;
            
            // Verificar si la clase está seleccionada
            if (this.selectedClasses.has(cls.id)) {
                classCard.classList.add('selected');
            }
            
            // Determinar clase de modalidad para CSS
            const modalityClass = cls.modality.toLowerCase() === 'virtual' ? 'virtual' : 'presencial';
            
            // Determinar texto del botón según selección
            const buttonText = this.selectedClasses.has(cls.id) ? '✓ Agregada' : '+ Agregar al calendario';
            const buttonClass = this.selectedClasses.has(cls.id) ? 'add-to-calendar-btn added' : 'add-to-calendar-btn';
            
            classCard.innerHTML = `
                <div class="class-info">
                    <div class="class-title">${cls.title}</div>
                    <div class="class-details">
                        <span class="detail-item">📅 ${cls.displayDate}</span>
                        <span class="detail-item">🕒 ${cls.displayTime}</span>
                        <span class="detail-item modality ${modalityClass}">${cls.modality}</span>
                    </div>
                    <div class="class-instructor">${cls.instructor}</div>
                </div>
                <button class="${buttonClass}" onclick="calendarManager.addToCalendar(${cls.id})">
                    ${buttonText}
                </button>
            `;
            
            // Insertar antes de calendar-actions si existe
            if (calendarActions) {
                container.insertBefore(classCard, calendarActions);
            } else {
                container.appendChild(classCard);
            }
        });
        
        // Actualizar contador y vista previa después de renderizar
        this.updateSelectionCount();
        this.updatePreview();
        this.updateDownloadButton();
        this.markUpcomingClasses();
        
        console.log('✅ Clases renderizadas desde JS:', this.classesData.length);
    }

    // Obtener recordatorios seleccionados
    getSelectedReminders() {
        const checkboxes = document.querySelectorAll('.reminder-checkbox:checked');
        const reminders = Array.from(checkboxes).map(cb => parseInt(cb.value));
        return reminders.sort((a, b) => a - b);
    }

    // Agregar clase al calendario
    addToCalendar(classId) {
        if (this.selectedClasses.has(classId)) {
            // Si ya está seleccionada, quitarla
            this.selectedClasses.delete(classId);
            this.updateClassCard(classId, false);
            this.showToast('La clase ha sido removida de la selección');
        } else {
            // Agregar a la selección
            this.selectedClasses.add(classId);
            this.updateClassCard(classId, true);
            this.showToast('La clase ha sido agregada al calendario');
        }
        
        this.updateSelectionCount();
        this.updatePreview();
        this.updateDownloadButton();
    }

    // Actualizar apariencia de la tarjeta de clase
    updateClassCard(classId, isSelected) {
        const classCard = document.querySelector(`.calendar-class-card[data-class-id="${classId}"]`);
        const button = classCard?.querySelector('.add-to-calendar-btn');
        
        if (classCard && button) {
            if (isSelected) {
                classCard.classList.add('selected');
                button.textContent = '✓ Agregada';
                button.classList.add('added');
            } else {
                classCard.classList.remove('selected');
                button.textContent = '+ Agregar al calendario';
                button.classList.remove('added');
            }
        }
    }

    // Actualizar contador de selección
    updateSelectionCount() {
        const countElement = document.getElementById('selectedClassesCount');
        if (countElement) {
            countElement.textContent = this.selectedClasses.size;
        }
    }

    // Actualizar vista previa
    updatePreview() {
        const previewList = document.getElementById('previewList');
        if (!previewList) return;
        
        if (this.selectedClasses.size === 0) {
            previewList.innerHTML = '<div class="empty-preview">No hay clases seleccionadas</div>';
            return;
        }
        
        previewList.innerHTML = '';
        
        Array.from(this.selectedClasses).forEach(classId => {
            const cls = this.classesData.find(c => c.id === classId);
            if (!cls) return;
            
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <div class="preview-item-info">
                    <div class="preview-item-title">${cls.title}</div>
                    <div class="preview-item-details">
                        <span>${cls.displayDate}</span>
                        <span>${cls.displayTime}</span>
                        <span>${cls.modality}</span>
                    </div>
                </div>
                <button class="remove-preview-btn" onclick="calendarManager.removeFromPreview(${classId})" title="Remover">
                    ✕
                </button>
            `;
            
            previewList.appendChild(previewItem);
        });
    }

    // Remover clase desde la vista previa
    removeFromPreview(classId) {
        this.selectedClasses.delete(classId);
        this.updateClassCard(classId, false);
        this.updateSelectionCount();
        this.updatePreview();
        this.updateDownloadButton();
        this.showToast('La clase ha sido removida de la selección');
    }

    // Actualizar estado del botón de descarga
    updateDownloadButton() {
        const downloadBtn = document.getElementById('downloadSelectedBtn');
        if (downloadBtn) {
            downloadBtn.disabled = this.selectedClasses.size === 0;
        }
    }

    // Generar contenido .ics para clases seleccionadas
    generateICSContent(reminders = []) {
        if (this.selectedClasses.size === 0) {
            throw new Error('No hay clases seleccionadas');
        }

        const now = new Date();
        const dtstamp = this.formatDateForICS(now);
        
        let icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Sistema de Inscripciones//Calendario Personal//ES',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:Clases Seleccionadas - Sistema de Inscripciones`,
            'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
            'X-WR-CALDESC:Clases seleccionadas del sistema de inscripciones'
        ];

        // Añadir cada clase seleccionada
        Array.from(this.selectedClasses).forEach(classId => {
            const cls = this.classesData.find(c => c.id === classId);
            if (cls) {
                icsContent = icsContent.concat(this.createEvent(cls, reminders, dtstamp));
            }
        });

        icsContent.push('END:VCALENDAR');
        
        return icsContent.join('\r\n');
    }

    // Generar contenido .ics para todas las clases
    generateAllICSContent(reminders = []) {
        const now = new Date();
        const dtstamp = this.formatDateForICS(now);
        
        let icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Sistema de Inscripciones//Todas las Clases//ES',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Todas las Clases - Sistema de Inscripciones',
            'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
            'X-WR-CALDESC:Todas las clases del sistema de inscripciones'
        ];

        // Añadir todas las clases
        this.classesData.forEach(cls => {
            icsContent = icsContent.concat(this.createEvent(cls, reminders, dtstamp));
        });

        icsContent.push('END:VCALENDAR');
        
        return icsContent.join('\r\n');
    }

    /**
     * Crea un evento en formato UTC para .ics
     * Convierte hora Argentina (GMT-3) a UTC sumando 3 horas
     */
    createEvent(cls, reminders, dtstamp) {
        // Parsear fecha y hora Argentina
        const [year, month, day] = cls.date.split('-').map(Number);
        
        // Hora de inicio Argentina
        const [startHour, startMinute] = cls.time.split(':').map(Number);
        // Hora de fin Argentina
        const [endHour, endMinute] = cls.endTime.split(':').map(Number);
        
        // Crear fechas UTC (sumar 3 horas para convertir ART a UTC)
        const startDate = new Date(Date.UTC(year, month - 1, day, startHour + 3, startMinute, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, endHour + 3, endMinute, 0));
        
        console.log(`📅 Creando evento para clase "${cls.title}" - Hora Argentina: ${cls.time} - Hora UTC: ${this.formatDateForICS(startDate)}`);
        
        const event = [
            'BEGIN:VEVENT',
            `UID:${cls.id}-${Date.now()}@sistema-inscripciones.com`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${this.formatDateForICS(startDate)}`,
            `DTEND:${this.formatDateForICS(endDate)}`,
            `SUMMARY:${this.escapeICS(cls.title)}`,
            `DESCRIPTION:${this.escapeICS(`${cls.description}\\nModalidad: ${cls.modality}\\nInstructor: ${cls.instructor}\\nHorario: ${cls.displayTime}`)}`,
            `LOCATION:${this.escapeICS(cls.location)}`,
            `STATUS:CONFIRMED`,
            `SEQUENCE:0`,
            `TRANSP:OPAQUE`,
            `CREATED:${dtstamp}`,
            `LAST-MODIFIED:${dtstamp}`
        ];

        // Añadir alarmas/recordatorios
        reminders.forEach(minutes => {
            if (minutes > 0) {
                event.push(
                    'BEGIN:VALARM',
                    'ACTION:DISPLAY',
                    `TRIGGER:-PT${minutes}M`,
                    `DESCRIPTION:Recordatorio: ${this.escapeICS(cls.title)}`,
                    'END:VALARM'
                );
            }
        });

        event.push('END:VEVENT');
        return event;
    }

    /**
     * Formatea una fecha UTC para .ics
     * @param {Date} date - Fecha en UTC
     * @returns {string} Fecha formateada como YYYYMMDDTHHmmSSZ
     */
    formatDateForICS(date) {
        // date ya es UTC, solo formateamos y agregamos 'Z'
        return date.toISOString()
            .replace(/[-:]/g, '')
            .split('.')[0] + 'Z';
    }

    // Escapar texto para .ics
    escapeICS(text) {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    // Descargar archivo .ics
    downloadICS(filename, content) {
        const blob = new Blob([content], { 
            type: 'text/calendar;charset=utf-8'
        });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // Descargar clases seleccionadas
    downloadSelected() {
        try {
            const reminders = this.getSelectedReminders();
            
            if (reminders.length === 0) {
                alert('⚠️ Selecciona al menos un recordatorio');
                return;
            }

            if (this.selectedClasses.size === 0) {
                alert('⚠️ Selecciona al menos una clase');
                return;
            }

            const icsContent = this.generateICSContent(reminders);
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const filename = `clases_seleccionadas_${dateStr}.ics`;
            
            this.downloadICS(filename, icsContent);
            
            this.showSuccessMessage(
                'Calendario descargado',
                `${this.selectedClasses.size} clases con recordatorios`
            );
            
            console.log('✅ Clases seleccionadas descargadas:', {
                cantidad: this.selectedClasses.size,
                recordatorios: reminders
            });
            
        } catch (error) {
            console.error('❌ Error descargando clases seleccionadas:', error);
            alert(`❌ Error: ${error.message}`);
        }
    }

    // Descargar todas las clases
    downloadAll() {
        try {
            const reminders = this.getSelectedReminders();
            
            if (reminders.length === 0) {
                alert('⚠️ Selecciona al menos un recordatorio');
                return;
            }

            const icsContent = this.generateAllICSContent(reminders);
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const filename = `todas_las_clases_${dateStr}.ics`;
            
            this.downloadICS(filename, icsContent);
            
            this.showSuccessMessage(
                'Todas las clases descargadas',
                `${this.classesData.length} clases con recordatorios`
            );
            
            console.log('✅ Todas las clases descargadas:', {
                cantidad: this.classesData.length,
                recordatorios: reminders
            });
            
        } catch (error) {
            console.error('❌ Error descargando todas las clases:', error);
            alert(`❌ Error: ${error.message}`);
        }
    }

    // Mostrar mensaje de éxito
    showSuccessMessage(title, message) {
        // Remover mensajes anteriores
        const existingMsg = document.querySelector('.calendar-success-message');
        if (existingMsg) existingMsg.remove();

        // Crear nuevo mensaje
        const successMsg = document.createElement('div');
        successMsg.className = 'calendar-success-message';
        successMsg.innerHTML = `
            <div class="success-icon">✅</div>
            <div class="success-content">
                <strong>${title}</strong>
                <div>${message}</div>
            </div>
        `;

        document.body.appendChild(successMsg);

        // Remover después de 4 segundos
        setTimeout(() => {
            if (successMsg.parentNode) {
                successMsg.classList.add('fade-out');
                setTimeout(() => successMsg.remove(), 300);
            }
        }, 4000);
    }

    // Mostrar toast temporal
    showToast(message) {
        // Crear toast
        const toast = document.createElement('div');
        toast.className = 'calendar-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideInUp 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutDown 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Marcar clases próximas (próximos 3 días)
    markUpcomingClasses() {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
        
        this.classesData.forEach(cls => {
            const [year, month, day] = cls.date.split('-').map(Number);
            const [hour, minute] = cls.time.split(':').map(Number);
            // Crear fecha en hora local para comparación visual
            const classDate = new Date(year, month - 1, day, hour, minute);
            const classCard = document.querySelector(`.calendar-class-card[data-class-id="${cls.id}"]`);
            
            if (classCard && classDate > now && classDate <= threeDaysFromNow) {
                classCard.classList.add('upcoming-class');
            }
        });
    }

    // Inicializar
    init() {
        console.log('✅ CalendarManager inicializado');
        
        // Esperar a que el DOM esté listo
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.renderClasses());
        } else {
            this.renderClasses();
        }
        
        // Configurar eventos de los checkboxes
        document.querySelectorAll('.reminder-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                console.log('🔔 Recordatorios actualizados:', this.getSelectedReminders());
            });
        });
        
        // Verificar periódicamente clases próximas
        setInterval(() => this.markUpcomingClasses(), 60000);
    }
}

// Crear instancia global
window.calendarManager = new CalendarManager();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    // Añadir animaciones CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInUp {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutDown {
            from {
                transform: translateY(0);
                opacity: 1;
            }
            to {
                transform: translateY(100%);
                opacity: 0;
            }
        }
        
        .calendar-toast {
            animation: slideInUp 0.3s ease;
        }
    `;
    document.head.appendChild(style);
    
    console.log('📅 Calendario (Columnas Derecha) completamente inicializado');
});

// API para uso desde otros scripts
window.CalendarAPI = {
    addClass: function(classData) {
        console.log('➕ Agregando clase dinámicamente:', classData);
    },
    
    clearSelection: function() {
        calendarManager.selectedClasses.clear();
        calendarManager.renderClasses(); // Volver a renderizar para actualizar botones
        calendarManager.showToast('Selección limpiada');
    }
};