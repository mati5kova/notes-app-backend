function transformToReadableDate(last_update) {
    const originalDate = new Date(last_update);
    const todayDate = new Date();
    //razlika v dnevih
    const differenceInDays = Math.floor((todayDate.getTime() - originalDate.getTime()) / (1000 * 3600 * 24));

    //preveri če je isti dan
    if (
        originalDate.getFullYear() === todayDate.getFullYear() &&
        originalDate.getMonth() + 1 === todayDate.getMonth() + 1 &&
        originalDate.getDate() === todayDate.getDate()
    ) {
        const hours = originalDate.getHours();
        const minutes = originalDate.getMinutes();

        const formattedHours = hours < 10 ? `0${hours}` : hours;
        const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;

        const transformedTime = `${formattedHours}:${formattedMinutes}`;
        return transformedTime;
    } else if (differenceInDays < 7 && originalDate.getDay() > 0) {
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = daysOfWeek[originalDate.getDay()];

        return dayOfWeek;
    } else {
        const day = originalDate.getDate();
        const month = originalDate.getMonth() + 1;
        const year = originalDate.getFullYear(); // % 100 če hočš samo zadne dve cifre

        // dodamo ničle če je treba
        const formattedDay = day < 10 ? `0${day}` : day;
        const formattedMonth = month < 10 ? `0${month}` : month;
        const formattedYear = year < 10 ? `0${year}` : year;

        // damo v pravilen format
        const transformedDate = `${formattedDay}/${formattedMonth}/${formattedYear}`;
        return transformedDate;
    }
}

module.exports = {
    transformToReadableDate,
};
