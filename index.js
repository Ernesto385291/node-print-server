const request = require("request");
const express = require("express");
const numeral = require("numeral");
const escpos = require("escpos");
const moment = require("moment");
const sharp = require("sharp");
const cors = require("cors");
const fs = require("fs");

escpos.USB = require("escpos-usb");

const device = new escpos.USB();

const app = express();

app.use(cors());
app.use(express.json());

let ticketData;

app.post("/print", (req, res) => {
  ticketData = req.body.sale;
  downloadImage(ticketData.header[0].image);
  res.send("Ticket enviado a la impresora");
});
app.get("/printers", (req, res) => {
  const devices = USB.findPrinter();
  res.send(devices);
});

app.listen(8080, () => {
  console.log("Servidor iniciado no cierres esta ventana");
});

//Download image from url
const downloadImage = (url) => {
  request(
    url || "https://web.somosoliver.com/static/media/oliver_logo.68c261fd.png"
  )
    .pipe(fs.createWriteStream("image.png"))
    .on("close", () => {
      resizeImage();
    });
};

//Resize image
const resizeImage = () =>
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
      });
      printTicket(ticketData);
    });

//Print image
const printTicket = (sale) => {
  const options = { encoding: "UTF8" };

  escpos.Image.load("resized.png", function (image) {
    device.open(async (err) => {
      if (err) {
        console.log(err);
      }
      const printer = new escpos.Printer(device, options);

      printer
        .align("ct")
        .image(image)
        .then(() => {
          printer
            .feed()
            .align("lt")
            .font("a")
            .text(sale.header[0].business_address)
            .text(`Tel: ${sale.header[0].business_phone}`)
            .text(
              `Fecha: ${moment(sale.header[0].created_at).format("DD/MM/YYYY")}`
            )
            .text(
              `Hora: ${moment(sale.header[0].created_at).format("hh:mm:ss")}`
            )
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
    });
  });
};
