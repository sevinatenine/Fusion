exports.delay = async function(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    })
}