function transformToReadableDate(last_update) {
    const originalDate = new Date(last_update);
    const todayDate = new Date();

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
