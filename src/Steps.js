


exports.logging = function (data, titulo) {
    /** FUNCIÓN DE ENVÍO A AZURE APP INSIGHT */
    console.info(titulo || "LOG:");
    console.info(data);
 



    return true;
}
