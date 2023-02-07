const request = require("request");
const express = require("express");
const numeral = require("numeral");
const moment = require("moment");
const sharp = require("sharp");
const cors = require("cors");
const fs = require("fs");

const { Printer, Image } = require("@node-escpos/core");

const USB = require("@node-escpos/usb-adapter");

const device = new USB();
const app = express();

app.use(cors());

app.use(express.json());

app.post("/print", (req, res) => {
  console.log("Data from request: ", req.body);
  const { sale } = req.body;

  //Download image from url
  downloadImage(sale.image, sale);
});

app.get("/printers", (req, res) => {
  const devices = USB.findPrinter();
  console.log(devices);
  res.send(devices);
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});

//Download image from url
const downloadImage = (url, sale) => {
  request("https://web.somosoliver.com/static/media/oliver_logo.68c261fd.png")
    .pipe(fs.createWriteStream("image.png"))
    .on("close", () => {
      console.log("Image downloaded");
      resizeImage(sale);
    });
};

//Resize image
const resizeImage = (sale) =>
  sharp("image.png")
    .resize(150)
    .toFile("resized.png", (err, info) => {
      if (err) {
        console.log(err);
      }
      //Delete original image
      fs.unlink("image.png", (err) => {
        if (err) {
          console.log(err);
        }
        console.log("Original image deleted");
      });
      console.log(info);
      printImage(sale);
    });

//Print image
const printImage = (sale) => {
  const options = { encoding: "UTF8" /* default */ };

  device.open(async (err) => {
    if (err) {
      console.log(err);
    }
    let printer = new Printer(device, options);
    const image = await Image.load("resized.png");

    printer = await printer.image(image, "D24");

    printer
      .font("a")
      .align("lt")
      .text(sale.header[0].business_address)
      .text(`Tel: ${sale.header[0].business_phone}`)
      .text(`Fecha: ${moment(sale.header[0].created_at).format("DD/MM/YYYY")}`)
      .text(`Hora: ${moment(sale.header[0].created_at).format("hh:mm:ss")}`)
      .text("================================")
      .style("b")
      .text("Productos")
      .text("================================");

    sale.products.forEach((product) => {
      printer
        .font("a")
        .style("normal")
        .text(product.name)
        .text(
          `${numeral(product.price).format("$0,0.00")} c/u x${
            product.cantidad
          } (${numeral(product.total).format("$0,0.00")})`
        );
    });

    printer
      .text("================================")
      .align("rt")
      .text(`Total: ${numeral(sale.header[0].value).format("$0,0.00")}`)
      .text(
        `Método de pago: ${
          ["Efectivo", "Tarjeta", "Transferencia", "Otro", "Deuda"][
            sale.header[0].payment_metod - 1
          ]
        }`
      )
      .feed();

    printer
      .align("ct")
      .text("Hecho con Oliver.")
      .feed()
      .text("Descarga la app \n y maneja tu negocio en:")
      .text("https://somosoliver.com");

    printer.cut().close();
  });
};
